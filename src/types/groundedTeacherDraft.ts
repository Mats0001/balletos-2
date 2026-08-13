import type { TeacherHeuristicState } from './teacherHeuristic';
import type { GroundedMetricAdapterId, SkeletonTargetFocusId } from './skeletonTarget';

export type GroundedTeacherDraftBlockReason =
  | 'target_not_selected'
  | 'video_playing'
  | 'exact_cache_frame_missing'
  | 'pose_packet_missing'
  | 'pose_packet_not_exact_cache'
  | 'pose_packet_stale'
  | 'pose_geometry_mismatch'
  | 'analysis_missing'
  | 'analysis_stale'
  | 'measurement_not_authorized'
  | 'overlay_missing'
  | 'overlay_stale'
  | 'overlay_blocked';

export interface GroundedTeacherEvidence {
  metricId: GroundedMetricAdapterId;
  valueDeg: number;
  confidence: number;
  measurementClass: 'vaganova_relation';
  heuristicState: Exclude<TeacherHeuristicState, 'blocked'>;
  sourceId: string;
  streamEpoch: number;
  generation: number;
  mediaTimeUs: number;
  videoWidth: number;
  videoHeight: number;
  policyVersion: string;
  source: 'exact_frame_cache';
}

export interface GroundedTeacherDraftSections {
  what: string;
  whyConditional: string;
  goalConditional: string;
  practiceForTeacherReview: string;
  metaphor: string;
  technical: string;
  limitations: string;
  sourceRefs: readonly string[];
}

export interface GroundedTeacherGuide {
  kind: 'image_vertical' | 'image_horizontal';
  anchor: 'pelvis_center' | 'shoulder_center';
  label:
    | 'Aplomb-Orientierung (2D) · Nicole prüft'
    | 'Schulter-Orientierung (2D) · Nicole prüft'
    | 'Becken-Orientierung (2D) · Nicole prüft';
  reviewState: 'pending_nicole';
  evidence: GroundedTeacherEvidence;
}

/** Compatibility alias for the first, vertical guide consumer. */
export type GroundedAplombGuide = GroundedTeacherGuide;

export interface GroundedGuideFrameContext {
  sourceId: string;
  streamEpoch: number;
  generation: number;
  mediaTimeUs: number;
  videoWidth: number;
  videoHeight: number;
  policyVersion: string;
}

export interface BlockedGroundedTeacherDraft {
  kind: 'blocked';
  target: SkeletonTargetFocusId | 'none';
  reason: GroundedTeacherDraftBlockReason;
  message: string;
}

export interface ReadyGroundedTeacherDraft {
  kind: 'ready';
  target: Extract<SkeletonTargetFocusId, 'spine_center' | 'shoulder_line' | 'pelvis_core'>;
  reviewState: 'pending_nicole';
  learnerVisible: false;
  parentVisible: false;
  evidence: GroundedTeacherEvidence;
  sections: GroundedTeacherDraftSections;
  guide: GroundedTeacherGuide;
}

export type GroundedTeacherDraft =
  | BlockedGroundedTeacherDraft
  | ReadyGroundedTeacherDraft;
