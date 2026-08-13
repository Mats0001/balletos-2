import type { CanonicalJointSample, CanonicalMotionFrame } from '../types/canonicalMotion';
import type { SkeletonPointId } from '../types/skeletonTarget';
import type { KinematicPoint, ReconstructedSkeleton } from './vaganova3DKinematics';

const REQUIRED_POINTS: readonly SkeletonPointId[] = Object.freeze([
  'head', 'neck', 'sternum', 'navel', 'pelvisCenter',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'pelvisL', 'pelvisR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'footL', 'footR',
]);

function isUsableJoint(point: CanonicalJointSample | undefined): point is CanonicalJointSample {
  return Boolean(point)
    && Number.isFinite(point?.x)
    && Number.isFinite(point?.y)
    && Number.isFinite(point?.z)
    && Number.isFinite(point?.confidence)
    && point!.confidence >= 0
    && point!.confidence <= 1;
}

function predictedPoint(x: number, y: number): KinematicPoint {
  return Object.freeze({ x, y, z: 0, vis: 0, isPredicted: true });
}

/**
 * Projects a metric canonical motion frame into the existing 2D display
 * skeleton. This is an avatar/visualization transform, never a scoring path.
 */
export function projectCanonicalFrameToSkeleton(input: {
  frame: CanonicalMotionFrame;
  width: number;
  height: number;
  paddingRatio?: number;
  mirrorX?: boolean;
}): ReconstructedSkeleton {
  const { frame, width, height } = input;
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Canonical avatar projection requires positive finite dimensions.');
  }
  const available = REQUIRED_POINTS
    .map(id => frame.joints[id])
    .filter(isUsableJoint);
  if (available.length < 5) throw new Error('Canonical avatar frame has too few usable joints.');

  const minX = Math.min(...available.map(point => point.x));
  const maxX = Math.max(...available.map(point => point.x));
  const minY = Math.min(...available.map(point => point.y));
  const maxY = Math.max(...available.map(point => point.y));
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  if (![sourceWidth, sourceHeight].every(Number.isFinite) || sourceWidth <= 1e-6 || sourceHeight <= 1e-6) {
    throw new Error('Canonical avatar frame geometry is degenerate.');
  }

  const paddingRatio = Math.max(0, Math.min(0.35, input.paddingRatio ?? 0.08));
  const usableWidth = width * (1 - paddingRatio * 2);
  const usableHeight = height * (1 - paddingRatio * 2);
  const scale = Math.min(usableWidth / sourceWidth, usableHeight / sourceHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const fallbackX = width / 2;
  const fallbackY = height / 2;

  const mapPoint = (id: SkeletonPointId): KinematicPoint => {
    const point = frame.joints[id];
    if (!isUsableJoint(point)) return predictedPoint(fallbackX, fallbackY);
    const signedX = (input.mirrorX ? -1 : 1) * (point.x - centerX);
    return Object.freeze({
      x: width / 2 + signedX * scale,
      y: height / 2 - (point.y - centerY) * scale,
      z: point.z * scale,
      vis: point.confidence,
      isPredicted: point.confidence < 0.3,
    });
  };

  const result = Object.fromEntries(REQUIRED_POINTS.map(id => [id, mapPoint(id)])) as unknown as ReconstructedSkeleton;
  return Object.freeze({ ...result, footL: result.footL, footR: result.footR });
}

