import { PoseLandmark, realMediaPipePose, PoseResultsData } from './realMediaPipePose';
import { FrameEntry, findBracketingFrames, interpolateFrame } from './frameInterpolator';
import { vaganovaIdbCache } from './vaganovaIdbCache';

const MAX_CACHED_VIDEOS = 3; // LRU eviction after 3 videos

/**
 * Frame-Ergebnis-Typ (Berater 2026-08-11):
 * no_pose, Timeout und Inferenzfehler als UNTERSCHIEDLICHE Ergebnisse.
 */
export type FrameResultType = 'valid' | 'no_pose' | 'timeout' | 'inference_error' | 'out_of_range';

interface CachedVideo {
  frames: FrameEntry[];
  fps: number;
  duration: number;
  lastAccessedAt: number;
  /** Qualitätsstatistik: Wie viele Frames pro Typ */
  resultCounts?: Record<FrameResultType, number>;
}

export class VaganovaFrameCacheService {
  private cache: Map<string, CachedVideo> = new Map();
  private isPreIndexingMap: Map<string, boolean> = new Map();
  /** Maps videoUrl → idb cache key (set when we know the key, i.e. after IDB lookup or scan). */
  private idbKeyMap: Map<string, string> = new Map();

  /**
   * Detect the actual FPS of the video.
   * Berater 2026-08-11: Die hartcodierte 30-fps-Annahme als Zeitquelle entfernen.
   * Versucht zuerst Metadaten, dann konservativen Fallback.
   * NICHT raten oder fest auf 30 setzen.
   */
  private detectVideoFps(videoEl: HTMLVideoElement): number {
    // Methode 1: WebKitDecodedFrameCount (Safari)
    const vAny = videoEl as unknown as Record<string, unknown>;
    if (typeof vAny['webkitDecodedFrameCount'] === 'number' && videoEl.duration > 0) {
      const decoded = vAny['webkitDecodedFrameCount'] as number;
      if (decoded > 10) {
        const fps = Math.round(decoded / videoEl.duration);
        if (fps >= 15 && fps <= 120) return fps;
      }
    }

    // Methode 2: Heuristik aus Video-Dimensionen (4K → wahrscheinlich 30fps, 1080p → 25/30/60)
    // Das ist KEINE sichere Erkennung, nur ein besserer Default als blindes 30.
    // Der FramePump (Schritt 3) wird rVFC für echte Frame-Timing-Daten nutzen.
    const w = videoEl.videoWidth;
    if (w >= 3840) return 30;      // 4K Videos typischerweise 30fps
    if (w >= 1920) return 30;      // 1080p: 30fps als konservativer Default
    if (w >= 1280) return 25;      // 720p: könnte 25fps (PAL) sein
    return 24;                     // Konservativster Default
  }

  /**
   * Pre-indexes video frames via off-screen canvas.
   * Checks IndexedDB first — if hit, loads instantly and skips the expensive scan.
   * After a full scan, persists results to IndexedDB for future sessions.
   *
   * @param idbKey  Stable cache key (`vaganova_v1_${filename}_${size}`).
   *                Call `vaganovaIdbCache.buildKey(url, file?)` to construct it.
   */
  public async preIndexVideo(
    videoUrl: string,
    videoEl: HTMLVideoElement,
    onProgress?: (percent: number, step: number, total: number, fromCache?: boolean) => void,
    idbKey?: string
  ): Promise<void> {
    if (this.isPreIndexingMap.get(videoUrl)) return;
    this.isPreIndexingMap.set(videoUrl, true);

    // ─── IDB Cache Lookup ────────────────────────────────────────────────────
    const key = idbKey ?? vaganovaIdbCache.buildKey(videoUrl);
    this.idbKeyMap.set(videoUrl, key);

    const cached = await vaganovaIdbCache.load(key);
    if (cached) {
      // Cache HIT — populate in-memory cache, skip the scan entirely
      this.evictOldest(videoUrl);
      this.cache.set(videoUrl, {
        frames: cached.frames,
        fps: cached.fps,
        duration: cached.duration,
        lastAccessedAt: Date.now(),
      });
      this.isPreIndexingMap.set(videoUrl, false);
      if (onProgress) onProgress(100, cached.frames.length, cached.frames.length, true);
      return;
    }

    // ─── Cache MISS — run full scan ──────────────────────────────────────────

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

    // FAIL-CLOSED (Berater 2026-08-11): no_pose frames sind echte Lücken.
    // Kein Carry-Forward – fehlende Evidenz wird als fehlend dargestellt.
    // Frames ohne valide Pose werden übersprungen (kein Entry für diesen Timestamp).

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
          // FAIL-CLOSED: Timeout = no_pose → Frame überspringen
          // Kein Carry-Forward mit lastValidLandmarks (Berater 2026-08-11)
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
              frames.push({ timeMs, landmarks: data.landmarks });
            }
            // FAIL-CLOSED: Garbage oder kein Pose → Frame überspringen
            // (kein Carry-Forward, kein Entry für diesen Timestamp)
          }
          // FAIL-CLOSED: Kein Landmark-Set → Frame überspringen
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
    if (onProgress) onProgress(100, totalFrames, totalFrames, false);

    // ─── Persist to IDB (non-blocking, fire-and-forget) ──────────────────────
    vaganovaIdbCache.save(key, frames, fps, duration).catch(() => {});
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

  /** Returns the IDB key used for this video (for UI display). */
  public getIdbKey(videoUrl: string): string | undefined {
    return this.idbKeyMap.get(videoUrl);
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

