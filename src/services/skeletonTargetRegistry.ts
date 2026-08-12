import type { ReconstructedSkeleton, KinematicPoint } from './vaganova3DKinematics';
import type {
  SelectedSkeletonTarget,
  SkeletonPointId,
  SkeletonTargetDefinition,
  SkeletonTargetId,
} from '../types/skeletonTarget';

const SPINE_ADAPTER = 'spine_tilt_aplomb' as const;
const SPINE_SCOPE = 'Regionale Rumpfachse (Schultermitte–Beckenmitte)';

export const SKELETON_TARGETS: readonly SkeletonTargetDefinition[] = Object.freeze([
  { id: 'joint.head', kind: 'joint', label: 'Kopfpunkt', shortLabel: 'Kopf', side: 'center', pointIds: ['head'], overlayRegion: 'head', focusId: 'head_epaulement', representativeLandmarkIndex: 0 },
  { id: 'joint.neck', kind: 'joint', label: 'Halsmitte', shortLabel: 'Hals', side: 'center', pointIds: ['neck'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100 },
  { id: 'joint.sternum', kind: 'joint', label: 'Brustbeinpunkt', shortLabel: 'Brustbein', side: 'center', pointIds: ['sternum'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100 },
  { id: 'joint.navel', kind: 'joint', label: 'Rumpfmitte', shortLabel: 'Rumpfmitte', side: 'center', pointIds: ['navel'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100 },
  { id: 'joint.pelvis_center', kind: 'joint', label: 'Beckenmitte', shortLabel: 'Beckenmitte', side: 'center', pointIds: ['pelvisCenter'], overlayRegion: 'pelvis', focusId: 'pelvis_core', representativeLandmarkIndex: 23 },
  { id: 'joint.shoulder_l', kind: 'joint', label: 'Linke Schulter', shortLabel: 'L-Schulter', side: 'left', pointIds: ['shoulderL'], overlayRegion: 'shoulder', focusId: 'shoulder_line', representativeLandmarkIndex: 11 },
  { id: 'joint.shoulder_r', kind: 'joint', label: 'Rechte Schulter', shortLabel: 'R-Schulter', side: 'right', pointIds: ['shoulderR'], overlayRegion: 'shoulder', focusId: 'shoulder_line', representativeLandmarkIndex: 12 },
  { id: 'joint.elbow_l', kind: 'joint', label: 'Linker Ellbogen', shortLabel: 'L-Ellbogen', side: 'left', pointIds: ['elbowL'], overlayRegion: 'armL', focusId: 'left_elbow', representativeLandmarkIndex: 13 },
  { id: 'joint.elbow_r', kind: 'joint', label: 'Rechter Ellbogen', shortLabel: 'R-Ellbogen', side: 'right', pointIds: ['elbowR'], overlayRegion: 'armR', focusId: 'right_elbow', representativeLandmarkIndex: 14 },
  { id: 'joint.wrist_l', kind: 'joint', label: 'Linkes Handgelenk', shortLabel: 'L-Hand', side: 'left', pointIds: ['wristL'], overlayRegion: 'armL', focusId: 'left_elbow', representativeLandmarkIndex: 15 },
  { id: 'joint.wrist_r', kind: 'joint', label: 'Rechtes Handgelenk', shortLabel: 'R-Hand', side: 'right', pointIds: ['wristR'], overlayRegion: 'armR', focusId: 'right_elbow', representativeLandmarkIndex: 16 },
  { id: 'joint.hip_l', kind: 'joint', label: 'Linke Hüfte', shortLabel: 'L-Hüfte', side: 'left', pointIds: ['pelvisL'], overlayRegion: 'pelvis', focusId: 'pelvis_core', representativeLandmarkIndex: 23 },
  { id: 'joint.hip_r', kind: 'joint', label: 'Rechte Hüfte', shortLabel: 'R-Hüfte', side: 'right', pointIds: ['pelvisR'], overlayRegion: 'pelvis', focusId: 'pelvis_core', representativeLandmarkIndex: 24 },
  { id: 'joint.knee_l', kind: 'joint', label: 'Linkes Knie', shortLabel: 'L-Knie', side: 'left', pointIds: ['kneeL'], overlayRegion: 'legL', focusId: 'left_knee', representativeLandmarkIndex: 25 },
  { id: 'joint.knee_r', kind: 'joint', label: 'Rechtes Knie', shortLabel: 'R-Knie', side: 'right', pointIds: ['kneeR'], overlayRegion: 'legR', focusId: 'right_knee', representativeLandmarkIndex: 26 },
  { id: 'joint.ankle_l', kind: 'joint', label: 'Linker Knöchel', shortLabel: 'L-Knöchel', side: 'left', pointIds: ['ankleL'], overlayRegion: 'legL', focusId: 'left_knee', representativeLandmarkIndex: 27 },
  { id: 'joint.ankle_r', kind: 'joint', label: 'Rechter Knöchel', shortLabel: 'R-Knöchel', side: 'right', pointIds: ['ankleR'], overlayRegion: 'legR', focusId: 'right_knee', representativeLandmarkIndex: 28 },
  { id: 'joint.foot_l', kind: 'joint', label: 'Linke Fußspitze', shortLabel: 'L-Fuß', side: 'left', pointIds: ['footL'], overlayRegion: 'footL', focusId: 'left_knee', representativeLandmarkIndex: 31 },
  { id: 'joint.foot_r', kind: 'joint', label: 'Rechte Fußspitze', shortLabel: 'R-Fuß', side: 'right', pointIds: ['footR'], overlayRegion: 'footR', focusId: 'right_knee', representativeLandmarkIndex: 32 },
  { id: 'bone.head_neck', kind: 'bone', label: 'Kopf–Hals-Achse', shortLabel: 'Kopf–Hals', side: 'center', pointIds: ['head', 'neck'], overlayRegion: 'head', focusId: 'head_epaulement', representativeLandmarkIndex: 0 },
  { id: 'bone.neck_sternum', kind: 'bone', label: 'Obere Rumpfachse', shortLabel: 'Rumpfachse oben', side: 'center', pointIds: ['neck', 'sternum'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100, metricAdapter: SPINE_ADAPTER, metricScopeLabel: SPINE_SCOPE },
  { id: 'bone.sternum_navel', kind: 'bone', label: 'Mittlere Rumpfachse', shortLabel: 'Rumpfachse Mitte', side: 'center', pointIds: ['sternum', 'navel'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100, metricAdapter: SPINE_ADAPTER, metricScopeLabel: SPINE_SCOPE },
  { id: 'bone.navel_pelvis', kind: 'bone', label: 'Untere Rumpfachse', shortLabel: 'Rumpfachse unten', side: 'center', pointIds: ['navel', 'pelvisCenter'], overlayRegion: 'spine', focusId: 'spine_center', representativeLandmarkIndex: 100, metricAdapter: SPINE_ADAPTER, metricScopeLabel: SPINE_SCOPE },
  { id: 'bone.shoulder_line', kind: 'bone', label: 'Schulterlinie', shortLabel: 'Schulterlinie', side: 'center', pointIds: ['shoulderL', 'shoulderR'], overlayRegion: 'shoulder', focusId: 'shoulder_line', representativeLandmarkIndex: 11 },
  { id: 'bone.upper_arm_l', kind: 'bone', label: 'Linker Oberarm', shortLabel: 'L-Oberarm', side: 'left', pointIds: ['shoulderL', 'elbowL'], overlayRegion: 'armL', focusId: 'left_elbow', representativeLandmarkIndex: 13 },
  { id: 'bone.upper_arm_r', kind: 'bone', label: 'Rechter Oberarm', shortLabel: 'R-Oberarm', side: 'right', pointIds: ['shoulderR', 'elbowR'], overlayRegion: 'armR', focusId: 'right_elbow', representativeLandmarkIndex: 14 },
  { id: 'bone.forearm_l', kind: 'bone', label: 'Linker Unterarm', shortLabel: 'L-Unterarm', side: 'left', pointIds: ['elbowL', 'wristL'], overlayRegion: 'armL', focusId: 'left_elbow', representativeLandmarkIndex: 15 },
  { id: 'bone.forearm_r', kind: 'bone', label: 'Rechter Unterarm', shortLabel: 'R-Unterarm', side: 'right', pointIds: ['elbowR', 'wristR'], overlayRegion: 'armR', focusId: 'right_elbow', representativeLandmarkIndex: 16 },
  { id: 'bone.torso_side_l', kind: 'bone', label: 'Linke Rumpfseite', shortLabel: 'L-Rumpfseite', side: 'left', pointIds: ['shoulderL', 'pelvisL'], overlayRegion: 'torsoAlignment', focusId: 'spine_center', representativeLandmarkIndex: 100, metricAdapter: SPINE_ADAPTER, metricScopeLabel: SPINE_SCOPE },
  { id: 'bone.torso_side_r', kind: 'bone', label: 'Rechte Rumpfseite', shortLabel: 'R-Rumpfseite', side: 'right', pointIds: ['shoulderR', 'pelvisR'], overlayRegion: 'torsoAlignment', focusId: 'spine_center', representativeLandmarkIndex: 100, metricAdapter: SPINE_ADAPTER, metricScopeLabel: SPINE_SCOPE },
  { id: 'bone.pelvis_line', kind: 'bone', label: 'Beckenlinie', shortLabel: 'Beckenlinie', side: 'center', pointIds: ['pelvisL', 'pelvisR'], overlayRegion: 'pelvis', focusId: 'pelvis_core', representativeLandmarkIndex: 23 },
  { id: 'bone.thigh_l', kind: 'bone', label: 'Linker Oberschenkel', shortLabel: 'L-Oberschenkel', side: 'left', pointIds: ['pelvisL', 'kneeL'], overlayRegion: 'legL', focusId: 'left_knee', representativeLandmarkIndex: 25 },
  { id: 'bone.thigh_r', kind: 'bone', label: 'Rechter Oberschenkel', shortLabel: 'R-Oberschenkel', side: 'right', pointIds: ['pelvisR', 'kneeR'], overlayRegion: 'legR', focusId: 'right_knee', representativeLandmarkIndex: 26 },
  { id: 'bone.shin_l', kind: 'bone', label: 'Linker Unterschenkel', shortLabel: 'L-Unterschenkel', side: 'left', pointIds: ['kneeL', 'ankleL'], overlayRegion: 'legL', focusId: 'left_knee', representativeLandmarkIndex: 27 },
  { id: 'bone.shin_r', kind: 'bone', label: 'Rechter Unterschenkel', shortLabel: 'R-Unterschenkel', side: 'right', pointIds: ['kneeR', 'ankleR'], overlayRegion: 'legR', focusId: 'right_knee', representativeLandmarkIndex: 28 },
  { id: 'bone.foot_l', kind: 'bone', label: 'Linke Fußlinie', shortLabel: 'L-Fußlinie', side: 'left', pointIds: ['ankleL', 'footL'], overlayRegion: 'footL', focusId: 'left_knee', representativeLandmarkIndex: 31 },
  { id: 'bone.foot_r', kind: 'bone', label: 'Rechte Fußlinie', shortLabel: 'R-Fußlinie', side: 'right', pointIds: ['ankleR', 'footR'], overlayRegion: 'footR', focusId: 'right_knee', representativeLandmarkIndex: 32 },
] satisfies readonly SkeletonTargetDefinition[]);

const TARGET_BY_ID = new Map(SKELETON_TARGETS.map(target => [target.id, target]));

export function getSkeletonTarget(targetId: SkeletonTargetId | string): SkeletonTargetDefinition | null {
  return TARGET_BY_ID.get(targetId as SkeletonTargetId) ?? null;
}

export function getSkeletonPoint(
  skeleton: ReconstructedSkeleton,
  pointId: SkeletonPointId,
): KinematicPoint | null {
  return skeleton[pointId] ?? null;
}

export function getSkeletonTargetPoints(
  skeleton: ReconstructedSkeleton,
  target: SkeletonTargetDefinition,
): readonly KinematicPoint[] {
  const points = target.pointIds
    .map(pointId => getSkeletonPoint(skeleton, pointId))
    .filter((point): point is KinematicPoint => Boolean(point));
  return points.length === target.pointIds.length ? points : [];
}

export interface SkeletonTargetHit {
  target: SkeletonTargetDefinition;
  anchorNormalized: Readonly<{ x: number; y: number }>;
  distancePx: number;
  segmentT?: number;
}

export interface SkeletonTargetHitTestInput {
  skeleton: ReconstructedSkeleton;
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
  videoWidth: number;
  videoHeight: number;
  jointRadiusPx?: number;
  boneTolerancePx?: number;
}

export function isSkeletonPointUsable(point: KinematicPoint | null | undefined): point is KinematicPoint {
  if (!point) return false;
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.vis)
    && point.vis >= 0.3
    && point.isPredicted !== true;
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; distance: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, distance: Math.hypot(px - x, py - y), t };
}

export function isSkeletonTargetGeometryUsable(
  skeleton: ReconstructedSkeleton,
  target: SkeletonTargetDefinition,
): boolean {
  const points = getSkeletonTargetPoints(skeleton, target);
  return points.length === target.pointIds.length && points.every(isSkeletonPointUsable);
}

export function resolveSkeletonTargetAnchor(
  skeleton: ReconstructedSkeleton,
  target: SkeletonTargetDefinition,
  videoWidth: number,
  videoHeight: number,
  segmentT: number = 0.5,
): Readonly<{ x: number; y: number }> | null {
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) return null;
  if (!isSkeletonTargetGeometryUsable(skeleton, target)) return null;
  const points = getSkeletonTargetPoints(skeleton, target);
  if (target.kind === 'joint') {
    return Object.freeze({ x: points[0].x / videoWidth, y: points[0].y / videoHeight });
  }
  const t = Math.max(0, Math.min(1, Number.isFinite(segmentT) ? segmentT : 0.5));
  return Object.freeze({
    x: (points[0].x + (points[1].x - points[0].x) * t) / videoWidth,
    y: (points[0].y + (points[1].y - points[0].y) * t) / videoHeight,
  });
}

export function findSkeletonTargetAtPoint(input: SkeletonTargetHitTestInput): SkeletonTargetHit | null {
  const {
    skeleton,
    canvasX,
    canvasY,
    canvasWidth,
    canvasHeight,
    videoWidth,
    videoHeight,
    jointRadiusPx = 22,
    boneTolerancePx = 16,
  } = input;
  if (
    ![canvasX, canvasY, canvasWidth, canvasHeight, videoWidth, videoHeight].every(Number.isFinite)
    || canvasWidth <= 0
    || canvasHeight <= 0
    || videoWidth <= 0
    || videoHeight <= 0
  ) return null;

  const toCanvas = (point: KinematicPoint) => ({
    x: point.x / videoWidth * canvasWidth,
    y: point.y / videoHeight * canvasHeight,
  });

  let best: SkeletonTargetHit | null = null;
  for (const target of SKELETON_TARGETS) {
    const points = getSkeletonTargetPoints(skeleton, target);
    if (!isSkeletonTargetGeometryUsable(skeleton, target)) continue;

    let hit: SkeletonTargetHit | null = null;
    if (target.kind === 'joint') {
      const point = toCanvas(points[0]);
      const distance = Math.hypot(canvasX - point.x, canvasY - point.y);
      if (distance <= jointRadiusPx) {
        hit = {
          target,
          anchorNormalized: Object.freeze({ x: point.x / canvasWidth, y: point.y / canvasHeight }),
          distancePx: distance,
        };
      }
    } else {
      const from = toCanvas(points[0]);
      const to = toCanvas(points[1]);
      const closest = closestPointOnSegment(canvasX, canvasY, from.x, from.y, to.x, to.y);
      if (closest.distance <= boneTolerancePx) {
        hit = {
          target,
          anchorNormalized: Object.freeze({ x: closest.x / canvasWidth, y: closest.y / canvasHeight }),
          distancePx: closest.distance,
          segmentT: closest.t,
        };
      }
    }

    if (!hit) continue;
    if (
      best === null
      || hit.distancePx < best.distancePx
      || (hit.distancePx === best.distancePx && hit.target.kind === 'joint' && best.target.kind === 'bone')
    ) best = hit;
  }
  return best;
}

export function createSelectedSkeletonTarget(
  hit: SkeletonTargetHit,
  frame: Omit<SelectedSkeletonTarget, 'targetId' | 'kind' | 'anchorNormalized'>,
): SelectedSkeletonTarget {
  return Object.freeze({
    targetId: hit.target.id,
    kind: hit.target.kind,
    anchorNormalized: Object.freeze({ ...hit.anchorNormalized }),
    segmentT: hit.segmentT,
    ...frame,
  });
}
