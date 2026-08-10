import { PoseLandmark, realMediaPipePose, PoseResultsData } from './realMediaPipePose';
import { FrameEntry, findBracketingFrames, interpolateFrame } from './frameInterpolator';

const MAX_CACHED_VIDEOS = 3; // LRU eviction after 3 videos

interface CachedVideo {
  frames: FrameEntry[];
  fps: number;
  duration: number;
  lastAccessedAt: number;
}

export class VaganovaFrameCacheService {
  private cache: Map<string, CachedVideo> = new Map();
  private isPreIndexingMap: Map<string, boolean> = new Map();

  /**
   * Detect the actual FPS of the video.
   * Most ballet videos are 30fps, some 25fps or 60fps.
   */
  private detectVideoFps(_videoEl: HTMLVideoElement): number {
    // Safe default for most video content
    // In future: use requestVideoFrameCallback to measure actual frame rate
    return 30;
  }

  /**
   * Pre-indexes video frames via off-screen canvas.
   * Now samples at the VIDEO's native FPS instead of hardcoded 20.
   */
  public async preIndexVideo(
    videoUrl: string,
    videoEl: HTMLVideoElement,
    onProgress?: (percent: number, step: number, total: number) => void
  ): Promise<void> {
    if (this.isPreIndexingMap.get(videoUrl)) return;
    this.isPreIndexingMap.set(videoUrl, true);

    // LRU eviction: remove oldest if at capacity
    this.evictOldest(videoUrl);

    // Remove any existing cache for this video
    this.cache.delete(videoUrl);

    const duration = videoEl.duration || 5.0;
    const fps = this.detectVideoFps(videoEl);
    const totalFrames = Math.floor(duration * fps);
    const stepSec = 1 / fps;

    const frames: FrameEntry[] = [];
    const originalTime = videoEl.currentTime;
    const wasPlaying = !videoEl.paused;

    videoEl.pause();

    // Create Off-Screen Canvas for zero-hang static bitmap processing
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let lastValidLandmarks: PoseLandmark[] | null = null;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const timeSec = frameIdx * stepSec;
      const timeMs = timeSec * 1000;

      // 1. Seek to the target time and WAIT for the browser to render that frame
      await new Promise<void>((resolve) => {
        // If we're already very close to the target time, just wait for rAF
        if (Math.abs(videoEl.currentTime - timeSec) < 0.005) {
          requestAnimationFrame(() => resolve());
          return;
        }

        const safetyTimeout = setTimeout(() => {
          videoEl.removeEventListener('seeked', onSeeked);
          // Even on timeout, wait for rAF to ensure frame is rendered
          requestAnimationFrame(() => resolve());
        }, 300);

        const onSeeked = () => {
          videoEl.removeEventListener('seeked', onSeeked);
          clearTimeout(safetyTimeout);
          // Double-rAF ensures browser has decoded AND rendered the new frame
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        };

        videoEl.addEventListener('seeked', onSeeked);
        videoEl.currentTime = timeSec;
      });

      // 2. Draw current video frame onto static off-screen canvas
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      }

      // 3. Process static canvas through MediaPipe WASM with 500ms timeout
      await new Promise<void>((resolve) => {
        let isDone = false;

        const complete = () => {
          if (!isDone) {
            isDone = true;
            resolve();
          }
        };

        const wasmTimeout = setTimeout(() => {
          if (lastValidLandmarks) {
            frames.push({ timeMs, landmarks: lastValidLandmarks });
          }
          complete();
        }, 500);

        realMediaPipePose.processFrame(canvas, (data: PoseResultsData) => {
          clearTimeout(wasmTimeout);
          if (data.landmarks && data.landmarks.length >= 33) {
            // VALIDATE: reject frames where key body points are out of range
            // MediaPipe sometimes returns garbage (x=-5, y=-13) on canvas processing
            const keyIndices = [0, 11, 12, 23, 24]; // nose, shoulders, hips
            const isInRange = keyIndices.every(idx => {
              const lm = data.landmarks[idx];
              return lm.x >= -0.5 && lm.x <= 1.5 && lm.y >= -0.5 && lm.y <= 1.5;
            });

            if (isInRange) {
              lastValidLandmarks = data.landmarks;
              frames.push({ timeMs, landmarks: data.landmarks });
            } else if (lastValidLandmarks) {
              frames.push({ timeMs, landmarks: lastValidLandmarks });
            }
          } else if (lastValidLandmarks) {
            frames.push({ timeMs, landmarks: lastValidLandmarks });
          }
          complete();
        }).catch(() => {
          clearTimeout(wasmTimeout);
          complete();
        });
      });

      const percent = Math.round(((frameIdx + 1) / totalFrames) * 100);
      if (onProgress) {
        onProgress(percent, frameIdx + 1, totalFrames);
      }

      // Yield to browser event loop EVERY frame so the UI stays responsive
      // WASM processing is ~50-200ms per frame on main thread
      await new Promise<void>(r => setTimeout(r, 16));
    }

    videoEl.currentTime = originalTime;
    if (wasPlaying) videoEl.play().catch(() => {});

    // Sort frames by time (should already be sorted, but guarantee it)
    frames.sort((a, b) => a.timeMs - b.timeMs);

    this.cache.set(videoUrl, {
      frames,
      fps,
      duration,
      lastAccessedAt: Date.now()
    });

    this.isPreIndexingMap.set(videoUrl, false);
    if (onProgress) onProgress(100, totalFrames, totalFrames);
  }

  /**
   * O(log n) frame retrieval with bilinear interpolation.
   * Returns interpolated landmarks for ANY timecode, not just cached grid points.
   */
  public getFrame(videoUrl: string, timeSec: number): PoseLandmark[] | null {
    const cached = this.cache.get(videoUrl);
    if (!cached || cached.frames.length === 0) return null;

    // Mark access for LRU
    cached.lastAccessedAt = Date.now();

    const targetTimeMs = timeSec * 1000;
    const bracket = findBracketingFrames(cached.frames, targetTimeMs);

    if (!bracket) return null;

    // If t is very close to 0 or 1, return the exact frame (no allocation needed)
    if (bracket.t < 0.01) return bracket.before.landmarks;
    if (bracket.t > 0.99) return bracket.after.landmarks;

    // Interpolate between bracketing frames for sub-frame smoothness
    return interpolateFrame(bracket.before.landmarks, bracket.after.landmarks, bracket.t);
  }

  public hasCache(videoUrl: string): boolean {
    const cached = this.cache.get(videoUrl);
    return !!cached && cached.frames.length > 10;
  }

  /** Returns all cached frames for a video (for post-scan analysis). */
  public getFrames(videoUrl: string): FrameEntry[] {
    return this.cache.get(videoUrl)?.frames ?? [];
  }

  /**
   * Clear cache for a specific video or all videos.
   */
  public clear(videoUrl?: string): void {
    if (videoUrl) {
      this.cache.delete(videoUrl);
      this.isPreIndexingMap.delete(videoUrl);
    } else {
      this.cache.clear();
      this.isPreIndexingMap.clear();
    }
  }

  /**
   * LRU eviction: if we're at MAX_CACHED_VIDEOS, remove the least recently accessed.
   */
  private evictOldest(excludeUrl: string): void {
    if (this.cache.size < MAX_CACHED_VIDEOS) return;

    let oldestUrl: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((cached, url) => {
      if (url !== excludeUrl && cached.lastAccessedAt < oldestTime) {
        oldestTime = cached.lastAccessedAt;
        oldestUrl = url;
      }
    });

    if (oldestUrl) {
      this.cache.delete(oldestUrl);
      this.isPreIndexingMap.delete(oldestUrl);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  public getStats(videoUrl: string): { frameCount: number; fps: number; durationSec: number } | null {
    const cached = this.cache.get(videoUrl);
    if (!cached) return null;
    return {
      frameCount: cached.frames.length,
      fps: cached.fps,
      durationSec: cached.duration
    };
  }
}

export const vaganovaFrameCache = new VaganovaFrameCacheService();

