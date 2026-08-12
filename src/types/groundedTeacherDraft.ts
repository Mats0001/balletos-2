import type { TeacherHeuristicState } from './teacherHeuristic';

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
  metricId: 'spine_tilt_aplomb';
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

export interface GroundedAplombGuide {
  kind: 'image_vertical';
  anchor: 'pelvis_center';
  label: 'Aplomb-Orientierung (2D) · Nicole prüft';
  reviewState: 'pending_nicole';
  evidence: GroundedTeacherEvidence;
}

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
  target: 'spine_center';
  reason: GroundedTeacherDraftBlockReason;
  message: string;
}

export interface ReadyGroundedTeacherDraft {
  kind: 'ready';
  target: 'spine_center';
  reviewState: 'pending_nicole';
  learnerVisible: false;
  parentVisible: false;
  evidence: GroundedTeacherEvidence;
  sections: GroundedTeacherDraftSections;
  guide: GroundedAplombGuide;
}

export type GroundedTeacherDraft =
  | BlockedGroundedTeacherDraft
  | ReadyGroundedTeacherDraft;
