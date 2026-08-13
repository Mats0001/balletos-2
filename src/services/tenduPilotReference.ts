import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
  CanonicalMotionFrame,
  CanonicalMotionPhaseId,
  DryadTenduClip,
} from '../types/canonicalMotion';
import { TENDU_PHASE_LABELS, TENDU_PHASE_ORDER } from '../types/canonicalMotion';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from './teacherPhaseAnalysis';
import { getMotionReferenceLibraryEntry } from './motionReferenceLibrary';
import { buildTenduTechnicalPrototype } from './tenduTechnicalPilot';

type CompactFrame = readonly [number, CanonicalMotionPhaseId, number, number, number, number];

/** Actual Dryad P1/T1 foot signal, downsampled from 190 frames at 250 Hz. */
const COMPACT_DRYAD_FRAMES: readonly CompactFrame[] = Object.freeze([
  [0, 'departure', 152.013, 442.443, 151.583, 449.479],
  [32000, 'departure', 154.306, 443.131, 152.460, 449.365],
  [64000, 'departure', 159.135, 445.086, 154.936, 449.235],
  [96000, 'extension', 167.116, 448.947, 160.436, 449.543],
  [128000, 'extension', 178.316, 451.914, 170.044, 448.232],
  [160000, 'extension', 191.728, 454.571, 183.234, 446.901],
  [192000, 'extension', 204.122, 456.840, 195.790, 445.602],
  [224000, 'extension', 215.071, 458.023, 207.661, 444.759],
  [256000, 'full_extension', 223.473, 458.623, 216.995, 444.250],
  [288000, 'full_extension', 228.490, 458.881, 222.712, 443.957],
  [320000, 'full_extension', 229.814, 458.936, 224.648, 443.838],
  [352000, 'full_extension', 227.999, 458.862, 223.348, 443.875],
  [384000, 'full_extension', 223.860, 458.668, 219.041, 444.033],
  [416000, 'return', 217.758, 458.239, 211.961, 444.368],
  [448000, 'return', 209.881, 457.484, 202.920, 444.920],
  [480000, 'return', 200.604, 456.359, 192.693, 445.661],
  [512000, 'return', 190.606, 454.873, 182.092, 446.542],
  [544000, 'return', 180.806, 453.103, 172.334, 447.568],
  [576000, 'return', 172.145, 451.188, 164.657, 448.781],
  [608000, 'return', 165.247, 449.020, 159.548, 449.717],
  [640000, 'closure', 160.131, 446.210, 156.526, 449.442],
  [672000, 'closure', 156.381, 444.152, 154.623, 449.151],
  [704000, 'closure', 153.711, 442.941, 153.222, 449.092],
  [736000, 'closure', 152.109, 442.386, 152.266, 449.240],
  [756000, 'closure', 151.613, 442.263, 151.918, 449.356],
]);

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

const UCY_CARRIER: CanonicalMotionClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'ucy-believer-stable-carrier-v1',
  exerciseId: 'unclassified_full_body_motion',
  label: 'UCY full-body carrier · internal pilot',
  frameRateHz: 120,
  coordinateSystem: 'balletos_metric_right_up_forward',
  provenance: Object.freeze({
    datasetId: 'ucy:ballet-believer',
    sourceUrl: 'https://dancedb.cs.ucy.ac.cy/main/performances',
    sourceKind: 'bvh_skeleton',
    rightsStatus: 'internal_research_only',
    licenseLabel: 'UCY internal pilot only',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  frames: Object.freeze([
    Object.freeze({ timeUs: 0, joints: CARRIER_JOINTS }),
    Object.freeze({ timeUs: 8_333, joints: CARRIER_JOINTS }),
  ]),
});

const first = COMPACT_DRYAD_FRAMES[0];
const dryadFrames: readonly CanonicalMotionFrame[] = Object.freeze(COMPACT_DRYAD_FRAMES.map(([
  timeUs, phaseId, ankleX, ankleY, footX, footY,
]) => Object.freeze({
  timeUs,
  phaseId,
  joints: Object.freeze({
    head: sample(0, 1.8),
    ankleL: sample(-.14, .08),
    footL: sample(-.20, .04, .12),
    ankleR: sample(.14 + (ankleX - first[2]) / 300, .08 - (ankleY - first[3]) / 300),
    footR: sample(.20 + (footX - first[4]) / 300, .04 - (footY - first[5]) / 300, .12),
  }),
})));

const DRYAD_TENDU: DryadTenduClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'dryad-tendu-p1-t1',
  exerciseId: 'tendu',
  label: 'Dryad Tendu · P1/T1',
  frameRateHz: 250,
  coordinateSystem: 'balletos_metric_right_up_forward',
  workingSide: 'right',
  participantId: 1,
  trial: 1,
  provenance: Object.freeze({
    datasetId: 'dryad:tendu-2025:p1:t1',
    sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
    sourceKind: 'optical_marker',
    rightsStatus: 'product_technical_signal_allowed',
    licenseLabel: 'CC0-1.0',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  events: Object.freeze([]),
  frames: dryadFrames,
});

export const TENDU_PILOT_REFERENCE = buildTenduTechnicalPrototype({
  dryad: DRYAD_TENDU,
  fullBodyCarrier: UCY_CARRIER,
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
  return Object.freeze(['dryad-tendu-2025', 'ucy-ballet-bvh'].flatMap(id => {
    const entry = getMotionReferenceLibraryEntry(id);
    return entry ? [`${entry.label} · ${entry.rightsLabel}`] : [];
  }));
}

export { TENDU_PHASE_LABELS };
