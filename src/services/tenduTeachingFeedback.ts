import {
  heuristicBaseState,
  heuristicEvidenceStrength,
  TEACHER_REGION_KEYS,
  type TeacherRegionKey,
} from '../types/teacherHeuristic';
import type { TeacherPhaseResult } from './teacherPhaseAnalysis';
import { buildTeacherFeedbackDraft, feedbackAgeBandFromLevel } from './teacherFeedbackLibrary';

export interface TenduTeachingFeedback {
  contentId: string;
  libraryVersion: string;
  reviewState: 'pending_nicole';
  phaseId: TeacherPhaseResult['id'];
  region: TeacherRegionKey | null;
  evidenceStyle: 'solid' | 'dotted';
  what: string;
  why: string;
  goal: string;
  practice: string;
  metaphor: string;
  limitation: string;
}

function severity(state: ReturnType<typeof heuristicBaseState>): number {
  return state === 'heuristic_strong_attention' ? 2 : state === 'heuristic_attention' ? 1 : 0;
}

export function buildTenduTeachingFeedback(
  phase: TeacherPhaseResult | null,
  context: Readonly<{ levelLabel?: string; direction?: 'devant' | 'a_la_seconde' | 'derriere' | 'undetermined' }> = {},
): TenduTeachingFeedback | null {
  if (!phase || !['departure', 'extension', 'full_extension', 'return', 'closure'].includes(phase.id)) return null;
  const candidates = TEACHER_REGION_KEYS.flatMap(region => {
    const state = phase.regions[region]?.state;
    const base = heuristicBaseState(state);
    return base ? [{ region, state, base }] : [];
  }).sort((a, b) => severity(b.base) - severity(a.base));
  const focus = candidates[0] ?? null;
  const base = focus?.base ?? null;
  if (!focus || !base) return null;
  const evidenceStrength = heuristicEvidenceStrength(focus.state);
  const draft = buildTeacherFeedbackDraft({
    exerciseId: 'tendu',
    phaseId: phase.id,
    region: focus.region,
    ageBand: feedbackAgeBandFromLevel(context.levelLabel ?? 'PRO'),
    trafficClass: base,
    evidenceStrength,
    direction: context.direction,
  });
  if (!draft) return null;
  return Object.freeze({
    contentId: draft.contentId,
    libraryVersion: draft.libraryVersion,
    reviewState: 'pending_nicole',
    phaseId: phase.id,
    region: focus.region,
    evidenceStyle: draft.evidenceStyle,
    what: draft.sections.what,
    why: draft.sections.whyPossible,
    goal: draft.sections.goal,
    practice: draft.sections.practice,
    metaphor: draft.sections.metaphor,
    limitation: draft.limitations.join(' '),
  });
}
