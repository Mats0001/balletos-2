import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
  CanonicalMotionFrame,
  MotionDatasetProvenance,
} from './canonicalMotion';

export type BalletMotionId = 'plie' | 'tendu' | 'passe' | 'jete' | 'changement';

export type MotionDirection =
  | 'not_applicable'
  | 'outward'
  | 'working_leg'
  | 'vertical_jump';

export interface DryadMovementEvent {
  id: string;
  label: string;
  timeUs: number;
}

export interface DryadMotionFrame extends CanonicalMotionFrame {
  /** Technical source-event interval. It is not a pedagogical ballet phase. */
  technicalPhaseId: string;
}

export interface DryadMotionTrial extends CanonicalMotionClip {
  exerciseId: Exclude<BalletMotionId, 'plie'>;
  participantId: number;
  trial: number;
  workingSide: 'left' | 'right' | 'bilateral';
  events: readonly DryadMovementEvent[];
  frames: readonly DryadMotionFrame[];
}

export interface DryadTechnicalEventTiming {
  eventId: string;
  label: string;
  medianProgress: number;
  p10Progress: number;
  p90Progress: number;
  sourceSampleCount: number;
}

export interface DryadTechnicalCohortFrame {
  timeUs: number;
  progress: number;
  technicalPhaseId: string;
  joints: Readonly<Partial<Record<CanonicalJointId, CanonicalJointSample>>>;
}

export interface DryadTechnicalCohortClip extends CanonicalMotionClip {
  exerciseId: Exclude<BalletMotionId, 'plie'>;
  workingSide: 'right' | 'bilateral';
  cohortSize: number;
  participantCount: number;
  sourceTrialCount: number;
  frames: readonly DryadTechnicalCohortFrame[];
}

export interface DryadTechnicalCohortAsset {
  schemaVersion: 1;
  generatedFromDigest: string;
  clip: DryadTechnicalCohortClip;
  eventTiming: readonly DryadTechnicalEventTiming[];
  medianDurationUs: number;
  p90FootPathSpread: number;
}

export interface MotionRegistryEntry {
  id: BalletMotionId;
  label: string;
  shortLabel: string;
  aliases: readonly string[];
  directions: readonly MotionDirection[];
  dataStatus: 'runtime_pose' | 'technical_cohort_imported';
  /**
   * `technical_phase_pilot` is selectable and phase-aware, but its colour
   * corridors are deliberately provisional until Nicole reviews them.
   */
  phaseEngineStatus: 'assessment_ready' | 'technical_phase_pilot' | 'technical_events_only';
  feedbackStatus: 'general_safe_draft' | 'safe_scaffold_ready';
  sourceIds: readonly string[];
  provenance: Readonly<{
    pedagogicalStatus: 'technical_only' | 'runtime_observation';
    nicoleReviewStatus: 'not_reviewed';
    productStatus: 'runtime_allowed' | 'technical_signal_only';
  }>;
  technicalAsset?: DryadTechnicalCohortAsset;
}

export type DryadMotionProvenance = MotionDatasetProvenance;
