// ─────────────────────────────────────────────────────────────────────────────
// FrameDescriptor – Central geometry metadata for a single video frame
//
// Every analysis result must be tagged with the FrameDescriptor of the frame
// it was computed from. This enables:
//   - Aspect-correct angle calculation (sourceWidth / sourceHeight)
//   - Rotation and mirroring awareness
//   - Reproducible comparison across resolutions
//   - Capture quality gating before biomechanical scoring
//
// Proposed by external advisor (2026-08-10), extends PosePacket provenance.
// ─────────────────────────────────────────────────────────────────────────────

export type CameraFacing = 'front' | 'back' | 'unknown';
export type CaptureMode = 'home_screening' | 'studio_biomechanics' | 'studio_kinetics';

export interface FrameDescriptor {
  /** Unique video or stream ID */
  videoId: string;

  /** Monotone session epoch (Date.now() at start) – matches PosePacket.streamEpoch */
  streamEpoch: number;

  /** Frame sequence number – matches PosePacket.frameSeq */
  frameSeq: number;

  /** Video timestamp in microseconds – matches PosePacket.mediaTimeUs */
  mediaTimeUs: number;

  // ── Source geometry ──────────────────────────────────────────────────────
  /** Actual source video width in pixels (e.g. 960 for 960×1280 portrait) */
  sourceWidth: number;

  /** Actual source video height in pixels (e.g. 1280 for 960×1280 portrait) */
  sourceHeight: number;

  /** Clockwise rotation applied to the source in degrees (0 | 90 | 180 | 270).
   *  From video container metadata. 0 if no rotation tag present. */
  rotationDeg: 0 | 90 | 180 | 270;

  /** Whether the image is horizontally mirrored (front camera self-view) */
  mirrored: boolean;

  /** Which camera produced this frame */
  cameraFacing: CameraFacing;

  // ── Inference geometry ────────────────────────────────────────────────────
  /** Width fed to MediaPipe (after downscaling, e.g. 360 for 960×1280 → longest edge 480) */
  inferenceWidth: number;

  /** Height fed to MediaPipe (after downscaling, e.g. 480) */
  inferenceHeight: number;

  /** MediaPipe model version / complexity used ('lite' | 'full' | 'heavy') */
  modelVersion: string;

  // ── Coordinate transforms ─────────────────────────────────────────────────
  /** Factor to convert normalized landmark x (0..1) → pixel x in source frame.
   *  Use: px = landmark.x * sourceWidth */
  normToSourceX: number; // = sourceWidth

  /** Factor to convert normalized landmark y (0..1) → pixel y in source frame.
   *  Use: py = landmark.y * sourceHeight */
  normToSourceY: number; // = sourceHeight

  // ── Capture quality ───────────────────────────────────────────────────────
  /** Capture mode context – determines which metrics are active */
  captureMode: CaptureMode;

  /** Average landmark visibility for this frame (0..1). <0.6 = low quality */
  avgLandmarkVisibility: number;

  /** Whether the frame passes the quality gate for biomechanical scoring */
  passesQualityGate: boolean;
}

/**
 * Create a FrameDescriptor from live video element + pose quality data.
 * Defaults are conservative (rotationDeg=0, mirrored=false, captureMode='home_screening').
 */
export function createFrameDescriptor(
  videoId: string,
  streamEpoch: number,
  frameSeq: number,
  mediaTimeUs: number,
  video: HTMLVideoElement,
  avgLandmarkVisibility: number,
  overrides?: Partial<Pick<FrameDescriptor, 'rotationDeg' | 'mirrored' | 'cameraFacing' | 'captureMode' | 'modelVersion'>>
): FrameDescriptor {
  const sw = video.videoWidth || 1;
  const sh = video.videoHeight || 1;

  // Infer inference dimensions: longest edge clamped to 480 (current setting)
  // Fix: actual dims for 960×1280 → 360×480, NOT 480×640 as the comment claimed
  const longestEdge = Math.max(sw, sh);
  const scaleFactor = 480 / longestEdge;
  const inferenceWidth = Math.round(sw * scaleFactor);
  const inferenceHeight = Math.round(sh * scaleFactor);

  const desc: FrameDescriptor = {
    videoId,
    streamEpoch,
    frameSeq,
    mediaTimeUs,
    sourceWidth: sw,
    sourceHeight: sh,
    rotationDeg: overrides?.rotationDeg ?? 0,
    mirrored: overrides?.mirrored ?? false,
    cameraFacing: overrides?.cameraFacing ?? 'unknown',
    inferenceWidth,
    inferenceHeight,
    modelVersion: overrides?.modelVersion ?? 'mediapipe-blaze-pose-v1',
    normToSourceX: sw,
    normToSourceY: sh,
    captureMode: overrides?.captureMode ?? 'home_screening',
    avgLandmarkVisibility,
    passesQualityGate: avgLandmarkVisibility >= 0.6,
  };

  return desc;
}

/**
 * Convert a normalized MediaPipe landmark to pixel space using a FrameDescriptor.
 * MUST be used before any geometric angle calculation.
 */
export function toPixel(
  lm: { x: number; y: number; z?: number },
  desc: Pick<FrameDescriptor, 'normToSourceX' | 'normToSourceY'>
): { x: number; y: number; z?: number } {
  return {
    x: lm.x * desc.normToSourceX,
    y: lm.y * desc.normToSourceY,
    z: lm.z,
  };
}

/**
 * Lightweight version for methods that only have vw/vh available (no full descriptor).
 * Use this when a FrameDescriptor is not yet available at call site.
 */
export function toPixelRaw(
  lm: { x: number; y: number },
  vw: number,
  vh: number
): { x: number; y: number } {
  return { x: lm.x * vw, y: lm.y * vh };
}
