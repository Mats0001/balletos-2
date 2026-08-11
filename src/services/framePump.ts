// ─────────────────────────────────────────────────────────────────────────────
// FramePump – Frame-accurate video frame delivery service
//
// Replaces ad-hoc requestAnimationFrame loops with a proper frame pump that:
//   - Uses requestVideoFrameCallback (rVFC) for frame-accurate timestamps
//   - Falls back to requestAnimationFrame (rAF) for older browsers
//   - Provides a monotonic generation counter for seek/source-change isolation
//   - Prevents stale callbacks from reaching consumers after stop/reset
//
// ARCHITEKTUR-VERTRAG (Berater 2026-08-11):
//   – framePump MUSS im Runtimepfad verwendet werden
//   – Alter Callback kann kein neues Video erreichen (generation-gate)
//   – Seek löscht alle alten Pakete und erhöht die Generation
// ─────────────────────────────────────────────────────────────────────────────

// rVFC type augmentation (not yet in lib.dom.d.ts)
interface VideoFrameMetadata {
  mediaTime: number;
  presentedFrames: number;
  presentationTime: DOMHighResTimeStamp;
}

// Use declaration merging instead of extending to avoid conflicts
// when lib.dom.d.ts already declares cancelVideoFrameCallback
interface RvfcMethods {
  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameMetadata) => void
  ): number;
  cancelVideoFrameCallback(handle: number): void;
}

type HTMLVideoElementWithRvfc = HTMLVideoElement & Partial<RvfcMethods>;

// ─── PUBLIC TYPES ───────────────────────────────────────────────────────────

export interface FrameTickEvent {
  /** Monotonic generation counter – changes on seek and source-change */
  generation: number;

  /** Frame sequence number within current generation */
  frameSeq: number;

  /** Video media time in microseconds (frame-accurate from rVFC, or approximated from rAF) */
  mediaTimeUs: number;

  /** performance.now() at callback invocation */
  presentationTimeMs: number;

  /** True if using requestVideoFrameCallback, false if rAF fallback */
  usingRvfc: boolean;

  /** Reference to the video element */
  video: HTMLVideoElement;
}

export type FrameCallback = (event: FrameTickEvent) => void;

// ─── FRAME PUMP ─────────────────────────────────────────────────────────────

export class FramePump {
  private _generation = 0;
  private _frameSeq = 0;
  private _running = false;
  private _video: HTMLVideoElement | null = null;
  private _callback: FrameCallback | null = null;
  private _rvfcHandle: number | null = null;
  private _rafHandle: number | null = null;
  private _useRvfc = false;

  /** Current generation – changes on seek and source-change */
  get generation(): number { return this._generation; }

  /** Current frame sequence within this generation */
  get frameSeq(): number { return this._frameSeq; }

  /** Whether the pump is currently running */
  get isRunning(): boolean { return this._running; }

  /** Whether rVFC is being used (vs rAF fallback) */
  get usingRvfc(): boolean { return this._useRvfc; }

  /**
   * Start the frame pump.
   * Delivers FrameTickEvents via onFrame callback at video frame rate.
   */
  start(video: HTMLVideoElement, onFrame: FrameCallback): void {
    if (this._running) this.stop();

    this._video = video;
    this._callback = onFrame;
    this._running = true;
    this._frameSeq = 0;

    // Detect rVFC support
    const vRvfc = video as HTMLVideoElementWithRvfc;
    this._useRvfc = typeof vRvfc.requestVideoFrameCallback === 'function';

    if (this._useRvfc) {
      console.info(`[FramePump] Started (rVFC) – generation=${this._generation}`);
      this._scheduleRvfc();
    } else {
      console.info(`[FramePump] Started (rAF fallback) – generation=${this._generation}`);
      this._scheduleRaf();
    }
  }

  /** Stop the pump. Pending callbacks are discarded via generation check. */
  stop(): void {
    this._running = false;

    if (this._rvfcHandle !== null) {
      const vRvfc = this._video as HTMLVideoElementWithRvfc | null;
      vRvfc?.cancelVideoFrameCallback?.(this._rvfcHandle);
      this._rvfcHandle = null;
    }

    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }

    this._callback = null;
    this._video = null;
  }

  /** Increment generation (for seek events). Discards in-flight callbacks. */
  bumpGeneration(): void {
    this._generation++;
    this._frameSeq = 0;
    console.info(`[FramePump] Generation bumped to ${this._generation} (seek)`);
  }

  /** Full reset: stop + bump generation (for source-change). */
  reset(): void {
    this.stop();
    this._generation++;
    this._frameSeq = 0;
    console.info(`[FramePump] Reset – generation=${this._generation}`);
  }

  // ─── INTERNALS ──────────────────────────────────────────────────────────

  private _scheduleRvfc(): void {
    const vRvfc = this._video as HTMLVideoElementWithRvfc;
    if (!vRvfc?.requestVideoFrameCallback) return;

    const capturedGen = this._generation;

    this._rvfcHandle = vRvfc.requestVideoFrameCallback(
      (now: DOMHighResTimeStamp, metadata: VideoFrameMetadata) => {
        // Generation gate: discard if generation changed (seek/source-change)
        if (capturedGen !== this._generation || !this._running) return;

        const event: FrameTickEvent = {
          generation: this._generation,
          frameSeq: this._frameSeq++,
          mediaTimeUs: Math.round(metadata.mediaTime * 1_000_000),
          presentationTimeMs: now,
          usingRvfc: true,
          video: vRvfc as HTMLVideoElement,
        };

        this._callback?.(event);

        // Schedule next frame (only if still running and same generation)
        if (this._running && this._generation === capturedGen) {
          this._scheduleRvfc();
        }
      }
    );
  }

  private _scheduleRaf(): void {
    const capturedGen = this._generation;

    this._rafHandle = requestAnimationFrame((now) => {
      // Generation gate
      if (capturedGen !== this._generation || !this._running) return;

      const video = this._video;
      if (!video) return;

      const event: FrameTickEvent = {
        generation: this._generation,
        frameSeq: this._frameSeq++,
        mediaTimeUs: Math.round((video.currentTime || 0) * 1_000_000),
        presentationTimeMs: now,
        usingRvfc: false,
        video,
      };

      this._callback?.(event);

      // Schedule next
      if (this._running && this._generation === capturedGen) {
        this._scheduleRaf();
      }
    });
  }
}

export const framePump = new FramePump();
