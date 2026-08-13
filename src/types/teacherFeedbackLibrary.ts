import type { BalletMotionId } from './motionRegistry';
import type { TeacherEvidenceStrength, TeacherHeuristicBaseState, TeacherRegionKey } from './teacherHeuristic';

export const TEACHER_FEEDBACK_LIBRARY_VERSION = 'balletos-feedback-scaffold-v1' as const;

export type FeedbackAgeBand = 'minis' | 'kids' | 'teens' | 'pro';
export type FeedbackDirection = 'not_applicable' | 'devant' | 'a_la_seconde' | 'derriere' | 'left' | 'right' | 'bilateral' | 'undetermined';

export interface TeacherFeedbackSections {
  what: string;
  whyPossible: string;
  goal: string;
  practice: string;
  metaphor: string;
}

export interface TeacherFeedbackDraft {
  schemaVersion: 1;
  contentId: string;
  libraryVersion: typeof TEACHER_FEEDBACK_LIBRARY_VERSION;
  exerciseId: BalletMotionId;
  phaseId: string;
  phaseLabel: string;
  region: TeacherRegionKey;
  ageBand: FeedbackAgeBand;
  direction: FeedbackDirection;
  trafficClass: TeacherHeuristicBaseState;
  evidenceStrength: TeacherEvidenceStrength;
  evidenceStyle: 'solid' | 'dotted';
  reviewState: 'pending_nicole';
  learnerVisible: false;
  parentVisible: false;
  claimBoundary: 'visible_observation_and_possible_pedagogical_effect';
  sections: Readonly<TeacherFeedbackSections>;
  limitations: readonly string[];
}
