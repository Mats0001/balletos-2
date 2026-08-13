import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
  CanonicalMotionFrame,
  CanonicalMotionPhaseId,
} from '../types/canonicalMotion';
import { TENDU_PHASE_LABELS, TENDU_PHASE_ORDER } from '../types/canonicalMotion';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from './teacherPhaseAnalysis';
import { getMotionReferenceLibraryEntry } from './motionReferenceLibrary';
import { buildTenduTechnicalPrototype } from './tenduTechnicalPilot';
import { DRYAD_TENDU_COHORT_ASSET, TENDU_PILOT_ASSET_MANIFEST } from '../data/tenduPilotAssets.generated';

const sample = (x: number, y: number, z = 0): CanonicalJointSample => Object.freeze({
  x, y, z, confidence: 1,
});

const CARRIER_JOINTS: Readonly<Record<CanonicalJointId, CanonicalJointSample>> = Object.freeze({
  head: sample(0, 1.8), neck: sample(0, 1.56), sternum: sample(0, 1.42), navel: sample(0, 1.18), pelvisCenter: sample(0, .98),
  shoulderL: sample(-.21, 1.52), shoulderR: sample(.21, 1.52), elbowL: sample(-.52, 1.48), elbowR: sample(.52, 1.48),
  wristL: sample(-.78, 1.45), wristR: sample(.78, 1.45), pelvisL: sample(-.12, .98), pelvisR: sample(.12, .98),
  kneeL: sample(-.13, .52), kneeR: sample(.13, .52), ankleL: sample(-.14, .08), ankleR: sample(.14, .08),
  footL: sample(-.20, .04, .12), footR: sample(.20, .04, .12),
});

const NEUTRAL_BALLETOS_CARRIER: CanonicalMotionClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'balletos-neutral-line-carrier-v1',
  exerciseId: 'neutral_line_avatar_carrier',
  label: 'BalletOS neutraler Linienkörper',
  frameRateHz: 60,
  coordinateSystem: 'balletos_metric_right_up_forward',
  provenance: Object.freeze({
    datasetId: 'balletos:neutral-line-carrier:v1',
    sourceUrl: 'internal://balletos/neutral-line-carrier',
    sourceKind: 'authored_animation',
    rightsStatus: 'product_technical_signal_allowed',
    licenseLabel: 'BalletOS-eigener neutraler Linienkörper',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  frames: Object.freeze([
    Object.freeze({ timeUs: 0, joints: CARRIER_JOINTS }),
    Object.freeze({ timeUs: 8_333, joints: CARRIER_JOINTS }),
  ]),
});

export const TENDU_PILOT_REFERENCE = buildTenduTechnicalPrototype({
  dryad: DRYAD_TENDU_COHORT_ASSET.clip,
  fullBodyCarrier: NEUTRAL_BALLETOS_CARRIER,
});

export type TenduPilotFrameResolution = Readonly<{
  kind: 'mapped';
  phase: TeacherPhaseResult;
  phaseProgress: number;
  referenceTimeUs: number;
  frame: CanonicalMotionFrame;
}> | Readonly<{
  kind: 'blocked';
  reason: 'analysis_missing' | 'recording_gate' | 'not_tendu' | 'outside_phase';
}>;

export function resolveTenduPilotFrame(
  analysis: TeacherPhaseAnalysis | null,
  currentTimeMs: number,
): TenduPilotFrameResolution {
  if (!analysis || !Number.isFinite(currentTimeMs)) return Object.freeze({ kind: 'blocked', reason: 'analysis_missing' });
  if (analysis.exerciseId !== 'tendu') return Object.freeze({ kind: 'blocked', reason: 'not_tendu' });
  if (analysis.gate.status === 'needs_correction') return Object.freeze({ kind: 'blocked', reason: 'recording_gate' });
  const phase = analysis.phases.find(item => currentTimeMs >= item.startMs && currentTimeMs <= item.endMs);
  if (!phase || !TENDU_PHASE_ORDER.includes(phase.id as CanonicalMotionPhaseId)) return Object.freeze({ kind: 'blocked', reason: 'outside_phase' });
  const phaseFrames = TENDU_PILOT_REFERENCE.clip.frames.filter(frame => frame.phaseId === phase.id);
  if (phaseFrames.length === 0) return Object.freeze({ kind: 'blocked', reason: 'outside_phase' });
  const durationMs = Math.max(1e-6, phase.endMs - phase.startMs);
  const phaseProgress = Math.max(0, Math.min(1, (currentTimeMs - phase.startMs) / durationMs));
  const referenceStartUs = phaseFrames[0].timeUs;
  const referenceEndUs = phaseFrames[phaseFrames.length - 1].timeUs;
  const referenceTimeUs = Math.round(referenceStartUs + phaseProgress * (referenceEndUs - referenceStartUs));
  const frame = phaseFrames.reduce((closest, candidate) => (
    Math.abs(candidate.timeUs - referenceTimeUs) < Math.abs(closest.timeUs - referenceTimeUs) ? candidate : closest
  ));
  return Object.freeze({ kind: 'mapped', phase, phaseProgress, referenceTimeUs, frame });
}

export function tenduPilotSourceLabels(): readonly string[] {
  return Object.freeze(['dryad-tendu-2025'].flatMap(id => {
    const entry = getMotionReferenceLibraryEntry(id);
    return entry ? [`${entry.label} · ${TENDU_PILOT_ASSET_MANIFEST.dryad.trialCount} Versuche · ${entry.rightsLabel}`] : [];
  }));
}

export { TENDU_PHASE_LABELS };
