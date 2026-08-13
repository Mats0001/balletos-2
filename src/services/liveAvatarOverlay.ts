import type { SkeletonPointId } from '../types/skeletonTarget';
import type { KinematicPoint, ReconstructedSkeleton } from './vaganova3DKinematics';

const POINT_IDS: readonly SkeletonPointId[] = Object.freeze([
  'head', 'neck', 'sternum', 'navel', 'pelvisCenter',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'pelvisL', 'pelvisR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'footL', 'footR',
]);

export type AvatarTransform = Readonly<{ scale: number; tx: number; ty: number }>;

function usable(point: KinematicPoint | null | undefined): point is KinematicPoint {
  return Boolean(point)
    && Number.isFinite(point!.x)
    && Number.isFinite(point!.y)
    && point!.isPredicted !== true
    && Number.isFinite(point!.vis)
    && point!.vis >= 0.3;
}

function mapSkeleton(
  skeleton: ReconstructedSkeleton,
  map: (point: KinematicPoint) => KinematicPoint,
): ReconstructedSkeleton {
  const entries = POINT_IDS.map(id => {
    const point = skeleton[id];
    return [id, usable(point) ? Object.freeze(map(point)) : null];
  });
  const mapped = Object.fromEntries(entries) as unknown as ReconstructedSkeleton;
  return Object.freeze({
    ...mapped,
    footL: mapped.footL,
    footR: mapped.footR,
  });
}

/** Stable full-frame projection: never re-fits from the moving body bounds. */
export function projectVideoSkeletonToAvatar(input: Readonly<{
  skeleton: ReconstructedSkeleton;
  videoWidth: number;
  videoHeight: number;
  width?: number;
  height?: number;
  padding?: number;
}>): ReconstructedSkeleton | null {
  const width = input.width ?? 360;
  const height = input.height ?? 360;
  const padding = input.padding ?? 10;
  if (![input.videoWidth, input.videoHeight, width, height, padding].every(Number.isFinite)
    || input.videoWidth <= 1 || input.videoHeight <= 1 || width <= padding * 2 || height <= padding * 2) return null;
  const scale = Math.min((width - padding * 2) / input.videoWidth, (height - padding * 2) / input.videoHeight);
  const tx = (width - input.videoWidth * scale) / 2;
  const ty = (height - input.videoHeight * scale) / 2;
  return mapSkeleton(input.skeleton, point => ({ ...point, x: tx + point.x * scale, y: ty + point.y * scale }));
}

function ankleMidpoint(skeleton: ReconstructedSkeleton): Readonly<{ x: number; y: number }> | null {
  if (usable(skeleton.ankleL) && usable(skeleton.ankleR)) {
    return { x: (skeleton.ankleL.x + skeleton.ankleR.x) / 2, y: (skeleton.ankleL.y + skeleton.ankleR.y) / 2 };
  }
  const point = usable(skeleton.ankleL) ? skeleton.ankleL : usable(skeleton.ankleR) ? skeleton.ankleR : null;
  return point ? { x: point.x, y: point.y } : null;
}

/** Aligns the technical body to the live pelvis/body scale without changing the live projection. */
export function referenceToLiveTransform(
  reference: ReconstructedSkeleton,
  live: ReconstructedSkeleton,
): AvatarTransform | null {
  const referenceAnkles = ankleMidpoint(reference);
  const liveAnkles = ankleMidpoint(live);
  if (!usable(reference.pelvisCenter) || !usable(reference.neck)
    || !usable(live.pelvisCenter) || !usable(live.neck)
    || !referenceAnkles || !liveAnkles) return null;
  const referenceLength = Math.hypot(reference.neck.x - referenceAnkles.x, reference.neck.y - referenceAnkles.y);
  const liveLength = Math.hypot(live.neck.x - liveAnkles.x, live.neck.y - liveAnkles.y);
  if (!Number.isFinite(referenceLength) || !Number.isFinite(liveLength) || referenceLength <= 1 || liveLength <= 1) return null;
  const scale = Math.max(0.4, Math.min(2.5, liveLength / referenceLength));
  return Object.freeze({
    scale,
    tx: live.pelvisCenter.x - reference.pelvisCenter.x * scale,
    ty: live.pelvisCenter.y - reference.pelvisCenter.y * scale,
  });
}

export function transformAvatarSkeleton(
  skeleton: ReconstructedSkeleton,
  transform: AvatarTransform,
): ReconstructedSkeleton {
  return mapSkeleton(skeleton, point => ({
    ...point,
    x: point.x * transform.scale + transform.tx,
    y: point.y * transform.scale + transform.ty,
  }));
}

export function transformAvatarPoint(
  point: Readonly<{ x: number; y: number }>,
  transform: AvatarTransform,
): Readonly<{ x: number; y: number }> {
  return Object.freeze({ x: point.x * transform.scale + transform.tx, y: point.y * transform.scale + transform.ty });
}

