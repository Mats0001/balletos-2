import type {
  GroundedTeacherGuide,
  GroundedTeacherDraftSections,
  GroundedTeacherEvidence,
} from './groundedTeacherDraft';
import type { NicoleProDraftV1 } from './nicoleProContent';

export type CueReviewStatus = 'GOOD' | 'CORRECTION' | 'WARNING' | 'NEUTRAL';
export type CueAudience = 'learner' | 'parent';

/** The complete pedagogical payload owned by a teacher revision. */
export interface CueReviewContent {
  poseName: string;
  status: CueReviewStatus;
  headline: string;
  cueMetaphor: string;
  jointFocusId: string;
  diagnosisText?: string;
  diagnosisMetaphor?: string;
  goalText?: string;
  practiceText?: string;
  technicalAnalysis?: string;
  referenceImageKey?: string;
  nicoleAction?: 'strength' | 'correction';
}

export interface GroundedAiOriginPayload {
  evidence: GroundedTeacherEvidence;
  sections: GroundedTeacherDraftSections;
  guide: GroundedTeacherGuide;
}

/** Immutable validated Nicole-Pro working copy captured before Nicole edits it. */
export interface NicoleProAiOriginPayload {
  draft: NicoleProDraftV1;
  knowledgeRegistryId: string;
  knowledgeRegistryVersion: string;
  ruleVersions: readonly Readonly<{ ruleId: string; version: string }>[];
}

export interface CueAiOriginSnapshot {
  originId: string;
  kind: 'grounded_ai_draft' | 'nicole_pro_draft' | 'legacy_ai_suggestion' | 'legacy_unverified';
  integrity: 'verified_application_snapshot' | 'legacy_unverified';
  videoSourceId: string;
  anchor: Readonly<{ mediaTimeUs: number; targetId: string }>;
  generatedAt: string;
  generatorId: string;
  policyVersion: string;
  originalContent: CueReviewContent;
  groundedPayload?: GroundedAiOriginPayload;
  nicoleProPayload?: NicoleProAiOriginPayload;
  legacyPayload?: Readonly<Record<string, unknown>>;
  digestAlgorithm: 'sha256-canonical-json-v1';
  originDigest: string;
}

export interface CueTeacherRevision {
  revisionId: string;
  parentRevisionId: string | null;
  revisionNumber: number;
  contentVersion: number;
  contentSchemaVersion: 1;
  actorId: string;
  createdAt: string;
  content: CueReviewContent;
  digestAlgorithm: 'sha256-canonical-json-v1';
  contentDigest: string;
  /** Digest of the complete revision core, including actor, time and lineage. */
  revisionDigest: string;
}

export type CueReviewAuditEventType =
  | 'revision_created'
  | 'approved'
  | 'rejected'
  | 'reopened'
  | 'audience_granted'
  | 'audience_revoked'
  | 'archived'
  | 'legacy_import';

export interface CueReviewAuditEvent {
  eventId: string;
  eventSequence: number;
  type: CueReviewAuditEventType;
  actorId: string;
  at: string;
  revisionId: string;
  revisionDigest: string;
  originId: string;
  audience?: CueAudience;
  reason?: 'superseded_by_revision' | 'teacher_action' | 'legacy_migration';
  previousEventDigest: string | null;
  digestAlgorithm: 'sha256-canonical-json-v1';
  eventDigest: string;
}

/**
 * Application-enforced audit envelope. It is not a tamper-proof/WORM store;
 * it prevents ordinary product writers from mutating the captured AI origin.
 */
export interface CueReviewAudit {
  schemaVersion: 1;
  recordId: string;
  recordDigest: string;
  origin: CueAiOriginSnapshot;
  revisions: readonly CueTeacherRevision[];
  currentRevisionId: string;
  events: readonly CueReviewAuditEvent[];
}

export interface CueReviewProjection {
  content: CueReviewContent;
  provenance: 'nicole_draft' | 'nicole_confirmed' | 'nicole_edited' | 'nicole_rejected';
  learnerVisible: boolean;
  parentVisible: boolean;
  revisionNumber: number;
  isApproved: boolean;
}

/** Deliberately narrow audience payload; teacher hypotheses and technical data never cross this boundary. */
export interface CueAudienceProjection {
  recordId: string;
  revisionId: string;
  audience: CueAudience;
  poseName: string;
  headline: string;
  cueMetaphor: string;
  goalText?: string;
  practiceText?: string;
}

export interface CueReviewCommandContext {
  actorId: string;
  now: () => string;
  createId: (prefix: 'record' | 'origin' | 'revision' | 'event') => string;
}

/** Optimistic concurrency token for the exact review state visible to Nicole. */
export interface CueReviewExpectedState {
  revisionId: string;
  lastEventDigest: string;
}

/** Only pedagogical copy may be changed inside an anchored review record. */
export type CueReviewEditablePatch = Partial<Omit<CueReviewContent, 'jointFocusId'>>;
