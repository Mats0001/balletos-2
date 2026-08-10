/**
 * LandmarkProvider – Abstraction layer for pose detection backends.
 *
 * Supports both browser-WASM (iPad / MediaPipe) and future server-side
 * (RTX 3090 / Python) backends behind a single interface.
 *
 * IMPORTANT: Does NOT modify realMediaPipePose.ts – only wraps it.
 */

import { PoseLandmark, realMediaPipePose, RealMediaPipePoseService } from './realMediaPipePose';

// ─── Result Types ────────────────────────────────────────────────────────────

/** Unified landmark result returned by any LandmarkProvider implementation. */
export interface LandmarkResult {
  /** 33 normalized pose landmarks (MediaPipe Pose) */
  pose: PoseLandmark[];
  /** 33 world-coordinate pose landmarks (meters, hip-centered) */
  poseWorldLandmarks?: PoseLandmark[];
  /** Optional: 2 × 21 hand landmarks (server-only for now) */
  hands?: PoseLandmark[][];
  /** Optional: 468 face mesh landmarks (server-only for now) */
  face?: PoseLandmark[];
  /** Which backend produced this result */
  source: 'browser' | 'server';
  /** Overall detection confidence 0–100, derived from landmark visibility */
  confidence: number;
  /** Media timestamp in seconds */
  timestamp: number;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

/** Common interface for all landmark detection backends. */
export interface LandmarkProvider {
  /** Load model weights / connect to server. */
  initialize(): Promise<void>;
  /**
   * Run pose detection on a single frame.
   * Returns null when no pose is detected.
   */
  detect(videoFrame: HTMLVideoElement | ImageBitmap): Promise<LandmarkResult | null>;
  /** Release resources (WASM heap, WebSocket, etc.). */
  dispose(): void;
}

// ─── Browser Implementation ─────────────────────────────────────────────────

/**
 * BrowserLandmarkProvider – wraps the existing RealMediaPipePoseService
 * so it conforms to the LandmarkProvider interface.
 *
 * Uses the WASM-based MediaPipe Pose model that already runs in the browser.
 * This class does NOT touch or modify realMediaPipePose.ts.
 */
export class BrowserLandmarkProvider implements LandmarkProvider {
  private service: RealMediaPipePoseService;

  constructor(service?: RealMediaPipePoseService) {
    this.service = service ?? realMediaPipePose;
  }

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /**
   * Detect pose landmarks in a single video frame.
   *
   * Wraps the callback-based `processFrame()` into a Promise.
   * For ImageBitmap inputs an offscreen canvas is used to bridge the
   * type mismatch (the underlying MediaPipe API accepts HTMLVideoElement
   * or HTMLCanvasElement).
   */
  async detect(videoFrame: HTMLVideoElement | ImageBitmap): Promise<LandmarkResult | null> {
    // Resolve the element that processFrame() can consume
    let element: HTMLVideoElement | HTMLCanvasElement;
    let needsCleanup = false;

    if (videoFrame instanceof HTMLVideoElement) {
      element = videoFrame;
    } else {
      // ImageBitmap → draw onto an offscreen HTMLCanvasElement
      const canvas = document.createElement('canvas');
      canvas.width = videoFrame.width;
      canvas.height = videoFrame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoFrame, 0, 0);
      element = canvas;
      needsCleanup = true;
    }

    // Derive timestamp (seconds) from the video element when possible
    const timestamp =
      videoFrame instanceof HTMLVideoElement ? videoFrame.currentTime : performance.now() / 1000;

    try {
      return await new Promise<LandmarkResult | null>((resolve) => {
        // Safety timeout – if processFrame silently drops the frame (e.g.
        // because isProcessingFrame is true or validation fails), we would
        // hang forever without this.
        const timeout = setTimeout(() => resolve(null), 3000);

        this.service.processFrame(element, (data) => {
          clearTimeout(timeout);

          const confidence = computeConfidence(data.landmarks);

          resolve({
            pose: data.landmarks,
            poseWorldLandmarks: data.worldLandmarks,
            source: 'browser',
            confidence,
            timestamp,
          });
        });
      });
    } finally {
      if (needsCleanup && element instanceof HTMLCanvasElement) {
        // Free the temporary canvas
        element.width = 0;
        element.height = 0;
      }
    }
  }

  dispose(): void {
    this.service.reset();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute an overall confidence score (0–100) from the average visibility
 * of all 33 pose landmarks.
 */
function computeConfidence(landmarks: PoseLandmark[]): number {
  if (!landmarks || landmarks.length === 0) return 0;

  let sum = 0;
  let count = 0;
  for (const lm of landmarks) {
    // visibility is optional; treat missing as fully visible (1.0)
    sum += lm.visibility ?? 1;
    count++;
  }

  // visibility is 0–1, scale to 0–100
  return Math.round((sum / count) * 100);
}

// ─── Convenience singleton ───────────────────────────────────────────────────

/** Pre-configured browser provider using the shared realMediaPipePose instance. */
export const browserLandmarkProvider = new BrowserLandmarkProvider();
