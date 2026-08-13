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
  sourceScope: 'same_video' | 'cross_video';
  referenceVideoSourceId: string;
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

function imageNormalizedDirection(
  direction: Readonly<{ x: number; y: number }>,
  videoWidth: number,
  videoHeight: number,
): Readonly<{ x: number; y: number }> | null {
  if (
    !Number.isFinite(direction.x) || !Number.isFinite(direction.y)
    || !Number.isFinite(videoWidth) || videoWidth <= 0
    || !Number.isFinite(videoHeight) || videoHeight <= 0
  ) return null;
  const x = direction.x / videoWidth;
  const y = direction.y / videoHeight;
  const length = Math.hypot(x, y);
  return Number.isFinite(length) && length > 1e-12
    ? Object.freeze({ x: x / length, y: y / length })
    : null;
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
  return imageNormalizedDirection({ x: dx / length, y: dy / length }, videoWidth, videoHeight);
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
    || analysis.gate.status === 'needs_correction'
    || !input.videoSourceId
    || !Number.isFinite(input.videoWidth) || input.videoWidth <= 0
    || !Number.isFinite(input.videoHeight) || input.videoHeight <= 0
  ) return Object.freeze([]);
  const plane = perspectivePlane(analysis);
  if (!plane) return Object.freeze([]);

  const comparisons: NicolePhaseReferenceComparison[] = [];
  const skeletonCache = new Map<FrameEntry, ReconstructedSkeleton | null>();
  for (const record of input.records) {
    if (!nicoleReferenceRecordIsValid(record)) continue;
    const version = record.versions.find(item => item.versionId === record.currentVersionId);
    const binding = version?.phaseBinding;
    if (
      !version || !binding
      || binding.exerciseId !== 'plie'
      || binding.policyVersion !== analysis.policyVersion
      || binding.levelLabel !== analysis.levelLabel
      || binding.perspectivePlane !== plane
    ) continue;
    const phase = analysis.phases.find(item => item.id === binding.phaseId);
    const target = getSkeletonTarget(record.targetId);
    const sameVideo = record.videoSourceId === input.videoSourceId;
    const hasSourcePhaseWindow = Number.isFinite(binding.sourcePhaseStartMs)
      && Number.isFinite(binding.sourcePhaseEndMs)
      && Number.isFinite(binding.sourcePhaseRepresentativeTimeMs);
    const sourceTimeMs = version.sourceMediaTimeUs / 1000;
    const sourceTimeMatchesBoundPhase = hasSourcePhaseWindow
      && sourceTimeMs >= binding.sourcePhaseStartMs!
      && sourceTimeMs <= binding.sourcePhaseEndMs!;
    const referenceDirection = imageNormalizedDirection(
      version.direction,
      version.videoWidth,
      version.videoHeight,
    );
    if (
      !phase || !target || target.kind !== 'bone'
      || !referenceDirection
      || (!sameVideo && !sourceTimeMatchesBoundPhase)
      || (sameVideo && (
        sourceTimeMs < phase.startMs
        || sourceTimeMs > phase.endMs
      ))
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
      return direction ? [axisDeltaDeg(referenceDirection, direction)] : [];
    });
    const coverage = deltas.length / Math.max(1, phaseFrames.length);
    const enough = deltas.length >= 2 && coverage >= 0.5;
    comparisons.push(Object.freeze({
      status: enough ? 'ready' : 'insufficient_evidence',
      sourceScope: sameVideo ? 'same_video' : 'cross_video',
      referenceVideoSourceId: record.videoSourceId,
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
      evidenceStyle: analysis.gate.status === 'ready' && deltas.length >= 3 && coverage >= 0.8
        ? 'solid'
        : 'dashed',
      medianAxisDeltaDeg: enough ? median(deltas) : null,
      minAxisDeltaDeg: enough ? Math.min(...deltas) : null,
      maxAxisDeltaDeg: enough ? Math.max(...deltas) : null,
    }));
  }

  const phaseOrder: readonly PliePhaseId[] = ['setup', 'descent', 'bottom', 'ascent', 'finish'];
  return Object.freeze(comparisons.sort((a, b) => (
    (a.sourceScope === b.sourceScope ? 0 : a.sourceScope === 'same_video' ? -1 : 1)
    || phaseOrder.indexOf(a.phaseId) - phaseOrder.indexOf(b.phaseId)
    || a.targetId.localeCompare(b.targetId)
    || a.referenceVideoSourceId.localeCompare(b.referenceVideoSourceId)
  )));
}
