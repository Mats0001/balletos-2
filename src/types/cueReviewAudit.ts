import type {
  GroundedTeacherGuide,
  GroundedTeacherDraftSections,
  GroundedTeacherEvidence,
} from './groundedTeacherDraft';
import type { NicoleProDraftV1 } from './nicoleProContent';
import type { NicoleAnatomyProBundleV1 } from './nicoleProAnatomy';

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
  /**
   * Optional for backward-compatible reload of older reviewed Pro records.
   * New exact-frame takeovers persist the validated internal Anatomy snapshot.
   */
  anatomyBundle?: NicoleAnatomyProBundleV1;
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
  | 'claim_reviewed'
  | 'anatomy_expert_note_recorded'
  | 'student_derivation_created'
  | 'audience_granted'
  | 'audience_revoked'
  | 'archived'
  | 'legacy_import';

export type CueNicoleProClaimDecision = 'accepted' | 'edited' | 'rejected';

/** Nicole's append-only decision about one immutable claim in the Pro origin. */
export interface CueNicoleProClaimReview {
  claimId: string;
  decision: CueNicoleProClaimDecision;
  editedText?: string;
  selectedForStudentDerivation: boolean;
}

/**
 * A local reviewer entry attached to the immutable Anatomy-Pro origin.
 * It is deliberately non-computational and never eligible for audience output.
 */
export interface CueNicoleAnatomyExpertNote {
  schemaVersion: 1;
  noteId: string;
  anatomyBundleId: string;
  previousNoteEventId: string | null;
  text: string;
  authorship: 'local_reviewer_entry_unverified';
  nonComputational: true;
  internalOnly: true;
  outwardEligibility: false;
}

/** The only pedagogical fields that may cross the teacher/audience boundary. */
export interface CueStudentDerivationContent {
  poseName: string;
  headline: string;
  cueMetaphor: string;
  goalText?: string;
  practiceText?: string;
}

/** Versioned, digest-bound student copy derived from explicitly reviewed Pro claims. */
export interface CueStudentDerivation {
  schemaVersion: 1;
  derivationId: string;
  basedOnRevisionId: string;
  basedOnRevisionDigest: string;
  actorId: string;
  createdAt: string;
  claimReviewEventIds: readonly string[];
  claimReviewSetDigest: string;
  content: CueStudentDerivationContent;
  digestAlgorithm: 'sha256-canonical-json-v1';
  derivationDigest: string;
}

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
  studentDerivationRef?: Readonly<{ derivationId: string; derivationDigest: string }>;
  reason?: 'superseded_by_revision' | 'teacher_action' | 'legacy_migration';
  claimReview?: CueNicoleProClaimReview;
  anatomyExpertNote?: CueNicoleAnatomyExpertNote;
  studentDerivation?: CueStudentDerivation;
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
  createId: (prefix: 'record' | 'origin' | 'revision' | 'event' | 'derivation') => string;
}

/** Optimistic concurrency token for the exact review state visible to Nicole. */
export interface CueReviewExpectedState {
  revisionId: string;
  lastEventDigest: string;
}

/** Only pedagogical copy may be changed inside an anchored review record. */
export type CueReviewEditablePatch = Partial<Omit<CueReviewContent, 'jointFocusId'>>;
