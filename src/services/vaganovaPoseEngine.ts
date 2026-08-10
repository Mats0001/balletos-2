import { PoseLandmark } from './realMediaPipePose';

/**
 * 1-Euro Filter implementation for smooth, zero-jitter, zero-lag pose landmark tracking
 */
class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.005, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  public filter(x: number, timestamp: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = timestamp;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001);
    this.tPrev = timestamp;

    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const xFiltered = this.xPrev + a * (x - this.xPrev);
    this.xPrev = xFiltered;

    return xFiltered;
  }

  public reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

export class VaganovaPoseEngineService {
  private filtersX: OneEuroFilter[] = [];
  private filtersY: OneEuroFilter[] = [];
  private filtersZ: OneEuroFilter[] = [];
  private lastVideoTime: number | null = null;

  /**
   * Smooth landmarks using 1-Euro filter.
   * @param landmarks Raw pose landmarks
   * @param videoTimeSec Optional video.currentTime for video-time-based filtering.
   *                     If provided, uses video time instead of wall-clock time.
   *                     This ensures consistent smoothing for both live and cached frames.
   */
  public smoothLandmarks(landmarks: PoseLandmark[] | null, videoTimeSec?: number): PoseLandmark[] | null {
    if (!landmarks || landmarks.length === 0) {
      this.reset();
      return null;
    }

    // Use video time (in ms) if available, otherwise wall-clock time
    const timestamp = videoTimeSec !== undefined ? videoTimeSec * 1000 : performance.now();

    // Seek detection: if video jumped more than 200ms, reset filters
    // This prevents the skeleton from "flying" across the screen after scrubbing
    if (videoTimeSec !== undefined && this.lastVideoTime !== null) {
      const delta = Math.abs(videoTimeSec - this.lastVideoTime);
      if (delta > 0.2) {
        this.reset();
      }
    }
    if (videoTimeSec !== undefined) {
      this.lastVideoTime = videoTimeSec;
    }

    if (this.filtersX.length !== landmarks.length) {
      this.filtersX = landmarks.map(() => new OneEuroFilter(1.2, 0.02, 1.0));
      this.filtersY = landmarks.map(() => new OneEuroFilter(1.2, 0.02, 1.0));
      this.filtersZ = landmarks.map(() => new OneEuroFilter(1.2, 0.02, 1.0));
    }

    return landmarks.map((pt, i) => {
      const smX = this.filtersX[i].filter(pt.x, timestamp);
      const smY = this.filtersY[i].filter(pt.y, timestamp);
      const smZ = this.filtersZ[i].filter(pt.z, timestamp);

      return {
        x: smX,
        y: smY,
        z: smZ,
        visibility: pt.visibility
      };
    });
  }

  public reset(): void {
    this.filtersX.forEach(f => f.reset());
    this.filtersY.forEach(f => f.reset());
    this.filtersZ.forEach(f => f.reset());
    this.lastVideoTime = null;
  }
}

export const vaganovaPoseEngine = new VaganovaPoseEngineService();
