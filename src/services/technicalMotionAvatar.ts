import { DRYAD_TECHNICAL_MOTION_ASSETS } from '../data/dryadMotionAssets.generated';
import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionFrame,
} from '../types/canonicalMotion';
import type { BalletMotionId, DryadTechnicalCohortAsset } from '../types/motionRegistry';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from './teacherPhaseAnalysis';
import { getMotionReferenceLibraryEntry } from './motionReferenceLibrary';
import { NEUTRAL_LINE_AVATAR_JOINTS } from './neutralLineAvatar';
import {
  resolveTenduPilotFrame,
  TENDU_PILOT_REFERENCE,
  tenduPilotSourceLabels,
} from './tenduPilotReference';
import { canonicalMotionProjectionBounds, type CanonicalProjectionBounds } from './canonicalMotionAvatar';

export type MotionAvatarExerciseId = Extract<BalletMotionId, 'tendu' | 'passe' | 'jete' | 'changement'>;

export interface TechnicalMotionAvatarReference {
  exerciseId: MotionAvatarExerciseId;
  exerciseLabel: string;
  sourceId: string;
  sourceSampleCount: number;
  sourceLabels: readonly string[];
  workingSides: readonly ('left' | 'right')[];
  frames: readonly Readonly<{ progress: number; frame: CanonicalMotionFrame }>[];
  projectionBounds: CanonicalProjectionBounds;
  limitations: readonly string[];
}

export type TechnicalMotionAvatarResolution = Readonly<{
  kind: 'mapped';
  reference: TechnicalMotionAvatarReference;
  phase: TeacherPhaseResult;
  phaseProgress: number;
  referenceProgress: number;
  frame: CanonicalMotionFrame;
}> | Readonly<{
  kind: 'blocked';
  reason: 'analysis_missing' | 'recording_gate' | 'unsupported_exercise' | 'outside_phase' | 'reference_missing';
}>;

const AVATAR_EXERCISES: readonly MotionAvatarExerciseId[] = Object.freeze(['tendu', 'passe', 'jete', 'changement']);
const PHASE_ORDER: Readonly<Record<MotionAvatarExerciseId, readonly string[]>> = Object.freeze({
  tendu: Object.freeze(['departure', 'extension', 'full_extension', 'return', 'closure']),
  passe: Object.freeze(['preparation', 'lift', 'placement', 'lower', 'finish']),
  jete: Object.freeze(['preparation', 'brush', 'release', 'return', 'finish']),
  changement: Object.freeze(['preparation', 'takeoff', 'flight', 'landing', 'finish']),
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sampleIsUsable(sample: CanonicalJointSample | undefined): sample is CanonicalJointSample {
  return Boolean(sample)
    && Number.isFinite(sample!.x)
    && Number.isFinite(sample!.y)
    && Number.isFinite(sample!.z)
    && Number.isFinite(sample!.confidence)
    && sample!.confidence >= 0.3;
}

function shifted(base: CanonicalJointSample, dx: number, dy: number, dz: number, confidence = 1): CanonicalJointSample {
  return Object.freeze({
    x: base.x + dx,
    y: base.y + dy,
    z: base.z + dz,
    confidence: Math.min(base.confidence, confidence),
  });
}

function bodyScale(asset: DryadTechnicalCohortAsset): number {
  const first = asset.clip.frames[0];
  const sourceNeck = first?.joints.neck;
  const sourceAnkleL = first?.joints.ankleL;
  const sourceAnkleR = first?.joints.ankleR;
  if (!sampleIsUsable(sourceNeck) || !sampleIsUsable(sourceAnkleL) || !sampleIsUsable(sourceAnkleR)) {
    throw new Error(`${asset.clip.exerciseId} technical avatar is missing body anchors.`);
  }
  const sourceHeight = sourceNeck.y - (sourceAnkleL.y + sourceAnkleR.y) / 2;
  const carrierHeight = NEUTRAL_LINE_AVATAR_JOINTS.neck.y
    - (NEUTRAL_LINE_AVATAR_JOINTS.ankleL.y + NEUTRAL_LINE_AVATAR_JOINTS.ankleR.y) / 2;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0.2) {
    throw new Error(`${asset.clip.exerciseId} technical avatar has invalid body height.`);
  }
  return carrierHeight / sourceHeight;
}

function retargetDryadFrame(
  asset: DryadTechnicalCohortAsset,
  frameIndex: number,
): CanonicalMotionFrame {
  const sourceFrame = asset.clip.frames[frameIndex];
  const originFrame = asset.clip.frames[0];
  if (!sourceFrame || !originFrame) throw new Error('Technical avatar frame is missing.');
  const scale = bodyScale(asset);
  const originNeck = originFrame.joints.neck;
  const currentNeck = sourceFrame.joints.neck;
  if (!sampleIsUsable(originNeck) || !sampleIsUsable(currentNeck)) {
    throw new Error('Technical avatar neck evidence is missing.');
  }
  const rootDelta = Object.freeze({
    x: (currentNeck.x - originNeck.x) * scale,
    y: (currentNeck.y - originNeck.y) * scale,
    z: (currentNeck.z - originNeck.z) * scale,
  });
  const joints = Object.fromEntries((Object.keys(NEUTRAL_LINE_AVATAR_JOINTS) as CanonicalJointId[]).map(id => {
    const base = NEUTRAL_LINE_AVATAR_JOINTS[id];
    return [id, shifted(base, rootDelta.x, rootDelta.y, rootDelta.z)];
  })) as Record<CanonicalJointId, CanonicalJointSample>;

  for (const side of ['L', 'R'] as const) {
    const ankleId = `ankle${side}` as const;
    const footId = `foot${side}` as const;
    const kneeId = `knee${side}` as const;
    const originAnkle = originFrame.joints[ankleId];
    const currentAnkle = sourceFrame.joints[ankleId];
    const originFoot = originFrame.joints[footId];
    const currentFoot = sourceFrame.joints[footId];
    if (![originAnkle, currentAnkle, originFoot, currentFoot].every(sampleIsUsable)) {
      throw new Error(`${asset.clip.exerciseId} technical avatar is missing ${side} foot evidence.`);
    }
    const ankleDelta = {
      x: (currentAnkle!.x - originAnkle!.x) * scale,
      y: (currentAnkle!.y - originAnkle!.y) * scale,
      z: (currentAnkle!.z - originAnkle!.z) * scale,
    };
    const footDelta = {
      x: (currentFoot!.x - originFoot!.x) * scale,
      y: (currentFoot!.y - originFoot!.y) * scale,
      z: (currentFoot!.z - originFoot!.z) * scale,
    };
    joints[ankleId] = shifted(NEUTRAL_LINE_AVATAR_JOINTS[ankleId], ankleDelta.x, ankleDelta.y, ankleDelta.z, currentAnkle!.confidence);
    joints[footId] = shifted(NEUTRAL_LINE_AVATAR_JOINTS[footId], footDelta.x, footDelta.y, footDelta.z, currentFoot!.confidence);

    // A neutral two-segment retarget keeps the line body connected. It is a
    // visualization scaffold, not an inferred anatomical knee trajectory.
    const outward = side === 'L' ? -1 : 1;
    const lifted = Math.max(0, ankleDelta.y - rootDelta.y);
    joints[kneeId] = shifted(
      NEUTRAL_LINE_AVATAR_JOINTS[kneeId],
      ankleDelta.x * .48 + outward * lifted * .32,
      ankleDelta.y * .45 + rootDelta.y * .55,
      ankleDelta.z * .42 + rootDelta.z * .58,
      currentAnkle!.confidence,
    );
  }

  return Object.freeze({
    timeUs: sourceFrame.timeUs,
    joints: Object.freeze(joints),
  });
}

function sourceLabels(asset: DryadTechnicalCohortAsset): readonly string[] {
  const libraryId = `dryad-${asset.clip.exerciseId}-2025`;
  const entry = getMotionReferenceLibraryEntry(libraryId);
  return Object.freeze([
    `${entry?.label ?? asset.clip.label} · ${asset.clip.sourceTrialCount} Versuche`,
    `${entry?.rightsLabel ?? asset.clip.provenance.licenseLabel} · technical_only · nicht Nicole-geprüft`,
  ]);
}

function buildReference(asset: DryadTechnicalCohortAsset): TechnicalMotionAvatarReference {
  const exerciseId = asset.clip.exerciseId;
  if (!['passe', 'jete', 'changement'].includes(exerciseId)) {
    throw new Error(`Unsupported technical avatar exercise ${exerciseId}.`);
  }
  const frames = Object.freeze(asset.clip.frames.map((sourceFrame, index) => Object.freeze({
    progress: clamp01(sourceFrame.progress),
    frame: retargetDryadFrame(asset, index),
  })));
  const workingSides: readonly ('left' | 'right')[] = asset.clip.workingSide === 'bilateral'
    ? Object.freeze(['left', 'right'] as const)
    : Object.freeze(['right'] as const);
  return Object.freeze({
    exerciseId: exerciseId as MotionAvatarExerciseId,
    exerciseLabel: asset.clip.label.split(' · ')[0].replace('Dryad ', ''),
    sourceId: asset.clip.provenance.datasetId,
    sourceSampleCount: asset.clip.sourceTrialCount,
    sourceLabels: sourceLabels(asset),
    workingSides,
    frames,
    projectionBounds: canonicalMotionProjectionBounds(frames.map(candidate => candidate.frame)),
    limitations: Object.freeze([
      'Dryad-Kohortenbewegung auf BalletOS-Linienkörper retargetet.',
      'Technischer Bewegungsvergleich, keine pädagogische Sollbewegung.',
      'Keine Nicole-Referenz und keine Quelle für automatische Ampelschwellen.',
    ]),
  });
}

const TECHNICAL_REFERENCES: readonly TechnicalMotionAvatarReference[] = Object.freeze(
  DRYAD_TECHNICAL_MOTION_ASSETS.map(buildReference),
);

const TENDU_REFERENCE: TechnicalMotionAvatarReference = Object.freeze({
  exerciseId: 'tendu',
  exerciseLabel: 'Tendu',
  sourceId: TENDU_PILOT_REFERENCE.clip.provenance.datasetId,
  sourceSampleCount: 100,
  sourceLabels: tenduPilotSourceLabels(),
  workingSides: Object.freeze([TENDU_PILOT_REFERENCE.workingSide]),
  frames: Object.freeze(TENDU_PILOT_REFERENCE.clip.frames.map((frame, index, frames) => Object.freeze({
    progress: frames.length <= 1 ? 0 : index / (frames.length - 1),
    frame,
  }))),
  projectionBounds: canonicalMotionProjectionBounds(TENDU_PILOT_REFERENCE.clip.frames),
  limitations: TENDU_PILOT_REFERENCE.limitations,
});

export function motionAvatarReference(exerciseId: MotionAvatarExerciseId): TechnicalMotionAvatarReference {
  if (exerciseId === 'tendu') return TENDU_REFERENCE;
  const reference = TECHNICAL_REFERENCES.find(candidate => candidate.exerciseId === exerciseId);
  if (!reference) throw new Error(`Technical avatar reference is missing for ${exerciseId}.`);
  return reference;
}

export function isMotionAvatarExercise(exerciseId: BalletMotionId | null | undefined): exerciseId is MotionAvatarExerciseId {
  return Boolean(exerciseId) && AVATAR_EXERCISES.includes(exerciseId as MotionAvatarExerciseId);
}

export function motionAvatarPhaseOrder(exerciseId: MotionAvatarExerciseId): readonly string[] {
  return PHASE_ORDER[exerciseId];
}

function nearestReferenceFrame(
  reference: TechnicalMotionAvatarReference,
  progress: number,
): CanonicalMotionFrame | null {
  return reference.frames.reduce<Readonly<{ progress: number; frame: CanonicalMotionFrame }> | null>((closest, candidate) => {
    if (!closest) return candidate;
    return Math.abs(candidate.progress - progress) < Math.abs(closest.progress - progress) ? candidate : closest;
  }, null)?.frame ?? null;
}

export function resolveTechnicalMotionAvatarFrame(
  analysis: TeacherPhaseAnalysis | null,
  currentTimeMs: number,
): TechnicalMotionAvatarResolution {
  if (!analysis || !Number.isFinite(currentTimeMs)) return Object.freeze({ kind: 'blocked', reason: 'analysis_missing' });
  if (!isMotionAvatarExercise(analysis.exerciseId)) return Object.freeze({ kind: 'blocked', reason: 'unsupported_exercise' });
  if (analysis.gate.status === 'needs_correction') return Object.freeze({ kind: 'blocked', reason: 'recording_gate' });

  if (analysis.exerciseId === 'tendu') {
    const resolution = resolveTenduPilotFrame(analysis, currentTimeMs);
    if (resolution.kind === 'blocked') {
      const reason = resolution.reason === 'not_tendu' ? 'unsupported_exercise' : resolution.reason;
      return Object.freeze({ kind: 'blocked', reason });
    }
    const order = PHASE_ORDER.tendu;
    const phaseIndex = order.indexOf(resolution.phase.id);
    const referenceProgress = clamp01((Math.max(0, phaseIndex) + resolution.phaseProgress) / order.length);
    return Object.freeze({
      kind: 'mapped', reference: TENDU_REFERENCE, phase: resolution.phase,
      phaseProgress: resolution.phaseProgress, referenceProgress, frame: resolution.frame,
    });
  }

  const order = PHASE_ORDER[analysis.exerciseId];
  const phase = analysis.phases.find(item => currentTimeMs >= item.startMs && currentTimeMs <= item.endMs);
  if (!phase) return Object.freeze({ kind: 'blocked', reason: 'outside_phase' });
  const phaseIndex = order.indexOf(phase.id);
  if (phaseIndex < 0) return Object.freeze({ kind: 'blocked', reason: 'outside_phase' });
  const durationMs = Math.max(1e-6, phase.endMs - phase.startMs);
  const phaseProgress = clamp01((currentTimeMs - phase.startMs) / durationMs);
  const referenceProgress = clamp01((phaseIndex + phaseProgress) / order.length);
  const reference = motionAvatarReference(analysis.exerciseId);
  const frame = nearestReferenceFrame(reference, referenceProgress);
  if (!frame) return Object.freeze({ kind: 'blocked', reason: 'reference_missing' });
  return Object.freeze({ kind: 'mapped', reference, phase, phaseProgress, referenceProgress, frame });
}
