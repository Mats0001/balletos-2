import type { CanonicalMotionFrame, CanonicalMotionPhaseId } from '../types/canonicalMotion';
import { TENDU_PHASE_LABELS, TENDU_PHASE_ORDER } from '../types/canonicalMotion';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from './teacherPhaseAnalysis';
import { getMotionReferenceLibraryEntry } from './motionReferenceLibrary';
import { buildTenduTechnicalPrototype } from './tenduTechnicalPilot';
import { DRYAD_TENDU_COHORT_ASSET, TENDU_PILOT_ASSET_MANIFEST } from '../data/tenduPilotAssets.generated';
import { NEUTRAL_LINE_AVATAR_CLIP } from './neutralLineAvatar';

export const TENDU_PILOT_REFERENCE = buildTenduTechnicalPrototype({
  dryad: DRYAD_TENDU_COHORT_ASSET.clip,
  fullBodyCarrier: NEUTRAL_LINE_AVATAR_CLIP,
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
