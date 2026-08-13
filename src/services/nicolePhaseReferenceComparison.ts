import type { FrameEntry } from './frameInterpolator';
import {
  nicoleReferenceRecordIsValid,
} from './nicoleReferenceLine';
import {
  getSkeletonTarget,
  getSkeletonTargetPoints,
  isSkeletonTargetGeometryUsable,
} from './skeletonTargetRegistry';
import type { NicoleReferenceLineRecord } from '../types/nicoleReferenceLine';
import type { SkeletonTargetId } from '../types/skeletonTarget';
import type {
  PliePhaseId,
  TeacherPhaseAnalysis,
} from './teacherPhaseAnalysis';
import { vaganova3DKinematics, type ReconstructedSkeleton } from './vaganova3DKinematics';

export interface NicolePhaseReferenceComparison {
  status: 'ready' | 'insufficient_evidence';
  sourceScope: 'same_video';
  phaseId: PliePhaseId;
  targetId: SkeletonTargetId;
  targetLabel: string;
  recordId: string;
  versionId: string;
  versionNumber: number;
  referenceMediaTimeUs: number;
  usableSampleCount: number;
  phaseSampleCount: number;
  coverage: number;
  evidenceStyle: 'solid' | 'dashed';
  /** Smallest undirected 2D line-axis difference, never a correctness score. */
  medianAxisDeltaDeg: number | null;
  minAxisDeltaDeg: number | null;
  maxAxisDeltaDeg: number | null;
}

export interface CompareNicolePhaseReferencesInput {
  analysis: TeacherPhaseAnalysis | null;
  frames: readonly FrameEntry[];
  videoSourceId: string;
  videoWidth: number;
  videoHeight: number;
  records: readonly NicoleReferenceLineRecord[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function axisDeltaDeg(
  reference: Readonly<{ x: number; y: number }>,
  current: Readonly<{ x: number; y: number }>,
): number {
  // A visual line is an axis: reversing both endpoints does not create a
  // pedagogically different line. abs(dot) therefore yields 0..90 degrees.
  const dot = Math.max(-1, Math.min(1, reference.x * current.x + reference.y * current.y));
  return Math.acos(Math.abs(dot)) * 180 / Math.PI;
}

function currentBoneDirection(
  frame: FrameEntry,
  targetId: SkeletonTargetId,
  videoWidth: number,
  videoHeight: number,
  skeletonCache: Map<FrameEntry, ReconstructedSkeleton | null>,
): Readonly<{ x: number; y: number }> | null {
  if (frame.resultKind === 'no_pose' || !frame.landmarks || frame.landmarks.length < 33) return null;
  const target = getSkeletonTarget(targetId);
  if (!target || target.kind !== 'bone') return null;
  let skeleton = skeletonCache.get(frame);
  if (skeleton === undefined) {
    skeleton = vaganova3DKinematics.solve(
      frame.landmarks,
      frame.worldLandmarks ?? null,
      videoWidth,
      videoHeight,
    );
    skeletonCache.set(frame, skeleton);
  }
  if (!skeleton) return null;
  if (!isSkeletonTargetGeometryUsable(skeleton, target)) return null;
  const points = getSkeletonTargetPoints(skeleton, target);
  if (points.some(point => (
    point.x < 0 || point.x > videoWidth || point.y < 0 || point.y > videoHeight
  ))) return null;
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 1e-6) return null;
  return Object.freeze({ x: dx / length, y: dy / length });
}

function perspectivePlane(analysis: TeacherPhaseAnalysis): 'frontal' | 'profile' | null {
  const perspective = analysis.gate.detectedPerspective;
  if (perspective === 'FRONTAL') return 'frontal';
  if (perspective === 'PROFILE_LEFT' || perspective === 'PROFILE_RIGHT') return 'profile';
  return null;
}

export function compareNicolePhaseReferences(
  input: CompareNicolePhaseReferencesInput,
): readonly NicolePhaseReferenceComparison[] {
  const { analysis } = input;
  if (
    !analysis
    || analysis.gate.status !== 'ready'
    || !input.videoSourceId
    || !Number.isFinite(input.videoWidth) || input.videoWidth <= 0
    || !Number.isFinite(input.videoHeight) || input.videoHeight <= 0
  ) return Object.freeze([]);
  const plane = perspectivePlane(analysis);
  if (!plane) return Object.freeze([]);

  const comparisons: NicolePhaseReferenceComparison[] = [];
  const skeletonCache = new Map<FrameEntry, ReconstructedSkeleton | null>();
  for (const record of input.records) {
    if (!nicoleReferenceRecordIsValid(record) || record.videoSourceId !== input.videoSourceId) continue;
    const version = record.versions.find(item => item.versionId === record.currentVersionId);
    const binding = version?.phaseBinding;
    if (
      !version || !binding
      || version.videoWidth !== input.videoWidth
      || version.videoHeight !== input.videoHeight
      || binding.exerciseId !== 'plie'
      || binding.policyVersion !== analysis.policyVersion
      || binding.levelLabel !== analysis.levelLabel
      || binding.perspectivePlane !== plane
    ) continue;
    const phase = analysis.phases.find(item => item.id === binding.phaseId);
    const target = getSkeletonTarget(record.targetId);
    if (
      !phase || !target || target.kind !== 'bone'
      || version.sourceMediaTimeUs / 1000 < phase.startMs
      || version.sourceMediaTimeUs / 1000 > phase.endMs
    ) continue;

    const phaseFrames = input.frames.filter(frame => (
      frame.timeMs >= phase.startMs && frame.timeMs <= phase.endMs
    ));
    const deltas = phaseFrames.flatMap(frame => {
      const direction = currentBoneDirection(
        frame,
        record.targetId,
        input.videoWidth,
        input.videoHeight,
        skeletonCache,
      );
      return direction ? [axisDeltaDeg(version.direction, direction)] : [];
    });
    const coverage = deltas.length / Math.max(1, phaseFrames.length);
    const enough = deltas.length >= 2 && coverage >= 0.5;
    comparisons.push(Object.freeze({
      status: enough ? 'ready' : 'insufficient_evidence',
      sourceScope: 'same_video',
      phaseId: phase.id,
      targetId: record.targetId,
      targetLabel: target.label,
      recordId: record.recordId,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      referenceMediaTimeUs: version.sourceMediaTimeUs,
      usableSampleCount: deltas.length,
      phaseSampleCount: phaseFrames.length,
      coverage,
      evidenceStyle: deltas.length >= 3 && coverage >= 0.8 ? 'solid' : 'dashed',
      medianAxisDeltaDeg: enough ? median(deltas) : null,
      minAxisDeltaDeg: enough ? Math.min(...deltas) : null,
      maxAxisDeltaDeg: enough ? Math.max(...deltas) : null,
    }));
  }

  const phaseOrder: readonly PliePhaseId[] = ['setup', 'descent', 'bottom', 'ascent', 'finish'];
  return Object.freeze(comparisons.sort((a, b) => (
    phaseOrder.indexOf(a.phaseId) - phaseOrder.indexOf(b.phaseId)
    || a.targetId.localeCompare(b.targetId)
  )));
}
