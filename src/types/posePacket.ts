// ─────────────────────────────────────────────────────────────────────────────
// PosePacket – Frame-accurate pose result with full provenance
//
// INVARIANT: A PosePacket may ONLY be rendered onto the video frame with the
// same mediaTimeUs (± FRAME_TOLERANCE_US). Rendering on any other frame is
// a synchronization error and must be rejected.
//
// This type is the foundation for the Frame Sync Foundation PR (2026-08-10).
// It enables detection and rejection of stale skeleton data after seek,
// video change, or slow inference.
// ─────────────────────────────────────────────────────────────────────────────
import { PoseLandmark } from '../services/realMediaPipePose';

export type PoseResultKind =
  | 'pose'          // Valid pose detected
  | 'no_pose'       // No person detected
  | 'low_quality'   // Pose detected but below confidence threshold
  | 'error';        // Inference error

export interface PosePacket {
  /** Monotone session ID: Date.now() at session start. Used to detect video/camera changes. */
  streamEpoch: number;

  /** Frame sequence number, monotonically increasing per session (0, 1, 2, ...) */
  frameSeq: number;

  /** Video-accurate timestamp in microseconds from requestVideoFrameCallback metadata.mediaTime.
   *  For rAF fallback: video.currentTime * 1_000_000. */
  mediaTimeUs: number;

  /** performance.now() immediately before MediaPipe inference call */
  inferenceStartedAtMs: number;

  /** performance.now() immediately after MediaPipe inference returned */
  inferenceEndedAtMs: number;

  /** Kind of result */
  resultKind: PoseResultKind;

  /** Normalized landmarks (x, y, z, visibility) – only present when resultKind === 'pose' */
  landmarks: PoseLandmark[];

  /** WorldLandmarks in hip-relative metric space – optional, only if available */
  worldLandmarks?: PoseLandmark[];

  /** Average landmark visibility (0–1), for quick quality check */
  avgVisibility: number;

  /** Where this packet originated */
  source: 'live_inference' | 'frame_cache' | 'pause_reprocess';

  /** FramePump generation at capture time */
  generation: number;

  /** Video URL or camera ID */
  sourceId: string;

  /** Video width in pixels (must be > 1, fail-closed) */
  videoWidth: number;

  /** Video height in pixels (must be > 1, fail-closed) */
  videoHeight: number;
}

/** Maximum age difference (in µs) between a packet's mediaTimeUs and the current
 *  video frame's mediaTimeUs before the packet is considered stale and skeleton is hidden.
 *  Default: one video frame at 30fps = 33,333 µs */
export const FRAME_TOLERANCE_US = 33_333;

/** Creates an empty "no_pose" packet for a given frame timestamp */
export function makeNoPosePacket(
  streamEpoch: number,
  frameSeq: number,
  mediaTimeUs: number,
  source: 'live_inference' | 'frame_cache' | 'pause_reprocess' = 'live_inference',
  generation: number = 0,
  sourceId: string = '',
  videoWidth: number = 0,
  videoHeight: number = 0,
): PosePacket {
  return {
    streamEpoch,
    frameSeq,
    mediaTimeUs,
    inferenceStartedAtMs: performance.now(),
    inferenceEndedAtMs: performance.now(),
    resultKind: 'no_pose',
    landmarks: [],
    avgVisibility: 0,
    source,
    generation,
    sourceId,
    videoWidth,
    videoHeight,
  };
}

/** Debug HUD data accumulated per render frame */
export interface FrameSyncDebugInfo {
  inferenceMs: number;       // Last inference duration
  poseAgeMs: number;         // Age of the latest packet vs current frame
  syncErrorMs: number;       // |poseAgeMs| when outside tolerance (else 0)
  droppedFrames: number;     // Packets discarded as stale (cumulative)
  skippedInferences: number; // Frames skipped because inference was running (cumulative)
  usingRvfc: boolean;        // true = requestVideoFrameCallback, false = rAF fallback
}
