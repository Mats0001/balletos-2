import type { BalletMotionId } from './motionRegistry';
import type {
  NicoleProBodySide,
  NicoleProCaptureView,
  NicoleProClaimType,
} from './nicoleProContent';

export const NICOLE_PRO_ANATOMY_SCHEMA_VERSION = 1 as const;

/** What kind of knowledge a rendered statement represents. */
export type NicoleAnatomyEpistemicKind =
  | 'measurement'
  | 'visible_observation'
  | 'general_knowledge'
  | 'working_hypothesis'
  | 'counter_hypothesis'
  | 'differentiation_step'
  | 'safety_notice';

/** Pedagogical review only. This never upgrades scientific validation. */
export type NicoleAnatomyReviewState =
  | 'ai_draft'
  | 'nicole_accepted'
  | 'nicole_revised'
  | 'rejected';

export type NicoleAnatomyScientificValidation =
  | 'curated_internal'
  | 'source_supported'
  | 'externally_validated_for_stated_scope';

export interface NicoleAnatomyStructuredSourceRefV1 {
  sourceId: string;
  title: string;
  locator: string;
  evidenceKind: 'product_policy' | 'textbook' | 'consensus' | 'systematic_review' | 'primary_study';
  population: string;
  scope: string;
  versionOrDate: string;
  limitations: string;
}

export interface NicoleAnatomyApplicabilityV1 {
  exerciseIds: readonly BalletMotionId[];
  phaseIds: readonly string[];
  sides: readonly NicoleProBodySide[];
  views: readonly NicoleProCaptureView[];
  ageScopes: readonly ('children' | 'adolescents' | 'adults' | 'unspecified')[];
}

export interface NicoleAnatomyKnowledgeBaseV1 {
  schemaVersion: typeof NICOLE_PRO_ANATOMY_SCHEMA_VERSION;
  itemId: string;
  version: string;
  reviewState: NicoleAnatomyReviewState;
  scientificValidation: NicoleAnatomyScientificValidation;
  sourceRefs: readonly NicoleAnatomyStructuredSourceRefV1[];
  applicability: Readonly<NicoleAnatomyApplicabilityV1>;
  internalOnly: true;
  outwardEligibility: false;
}

export interface NicoleAnatomyFactV1 extends NicoleAnatomyKnowledgeBaseV1 {
  kind: 'anatomy_fact';
  epistemicKind: 'general_knowledge';
  subjectConceptId: string;
  relation:
    | 'is_part_of'
    | 'participates_in'
    | 'coordinates_with'
    | 'may_contribute_to'
    | 'does_not_establish';
  objectConceptId: string;
  statement: string;
}

export interface NicoleAnatomyFunctionalChainStepV1 {
  stepId: string;
  subjectConceptId: string;
  relation: 'may_influence' | 'coordinates_with' | 'may_compensate_for';
  objectConceptId: string;
}

export interface NicoleAnatomyFunctionalChainV1 extends NicoleAnatomyKnowledgeBaseV1 {
  kind: 'functional_chain';
  epistemicKind: 'general_knowledge';
  statement: string;
  steps: readonly NicoleAnatomyFunctionalChainStepV1[];
  alternativeKnowledgeItemIds: readonly string[];
}

export type NicoleAnatomyKnowledgeItemV1 =
  | NicoleAnatomyFactV1
  | NicoleAnatomyFunctionalChainV1;

export interface NicoleAnatomyKnowledgeRegistryV1 {
  schemaVersion: typeof NICOLE_PRO_ANATOMY_SCHEMA_VERSION;
  registryId: string;
  registryVersion: string;
  sources: readonly NicoleAnatomyStructuredSourceRefV1[];
  items: readonly NicoleAnatomyKnowledgeItemV1[];
}

export interface NicoleAnatomyClaimBindingV1 {
  bindingId: string;
  claimId: string;
  evidenceIds: readonly string[];
  epistemicKind: 'measurement' | 'visible_observation';
  reviewState: NicoleAnatomyReviewState;
  internalOnly: true;
  outwardEligibility: false;
}

export interface NicoleAnatomyClaimAnnotationBaseV1 {
  statementId: string;
  reviewState: NicoleAnatomyReviewState;
  /** Status of the referenced general knowledge, never of the individual case. */
  scientificValidation: NicoleAnatomyScientificValidation;
  internalOnly: true;
  outwardEligibility: false;
}

export interface NicoleAnatomyHypothesisAnnotationV1 extends NicoleAnatomyClaimAnnotationBaseV1 {
  kind: 'hypothesis_annotation';
  epistemicKind: 'working_hypothesis' | 'counter_hypothesis';
  hypothesisDomain: 'anatomical' | 'coordination' | 'technical' | 'capture_artifact';
  hypothesisRole: 'working' | 'alternative' | 'artifact';
  modality: 'possible';
  /** Exact existing deterministic Nicole-Pro hypothesis claim. */
  sourceClaimId: string;
  claimBindingIds: readonly string[];
  knowledgeItemIds: readonly string[];
  explainsClaimIds: readonly string[];
  linkedDifferentiationTestIds: readonly string[];
}

export interface NicoleAnatomyHumanTestResultV1 {
  result: 'supports' | 'weakens' | 'inconclusive' | 'not_performed';
  recordedBy: string;
  recordedAt: string;
  note: string | null;
}

export interface NicoleAnatomyDifferentiationAnnotationV1 extends NicoleAnatomyClaimAnnotationBaseV1 {
  kind: 'differentiation_annotation';
  epistemicKind: 'differentiation_step';
  /** Exact existing deterministic Nicole-Pro differentiation-test claim. */
  sourceClaimId: string;
  targetHypothesisIds: readonly string[];
  allowedPerformer: 'nicole' | 'qualified_teacher' | 'health_professional';
  safetyClass: 'observation_only' | 'low_load_teacher_task' | 'clinical_only';
  contraindicationCodes: readonly ('pain_reported' | 'acute_injury_reported' | 'not_cleared')[];
  outcomeCriteria: Readonly<{
    supports: 'visible_pattern_changes_with_isolated_variable';
    weakens: 'visible_pattern_unchanged_with_isolated_variable';
    inconclusive: 'comparison_not_equivalent';
  }>;
  humanRecordedResult: Readonly<NicoleAnatomyHumanTestResultV1> | null;
}

export type NicoleAnatomyClaimAnnotationV1 =
  | NicoleAnatomyHypothesisAnnotationV1
  | NicoleAnatomyDifferentiationAnnotationV1;

/** Human-entered safety evidence. It is never inferred from pose or free AI text. */
export interface NicoleAnatomyHumanSignalV1 {
  signalId: string;
  signalCode: string;
  sourceRole: 'student' | 'parent' | 'nicole' | 'health_professional';
  acquisitionMode: 'reported' | 'observed' | 'documented';
  recordedBy: string;
  recordedAt: string;
  assessmentContextFingerprint: string;
  context: string;
  verbatim: string | null;
}

export interface NicoleAnatomySafetyActionV1 extends NicoleAnatomyClaimAnnotationBaseV1 {
  kind: 'safety_action';
  epistemicKind: 'safety_notice';
  policyRuleId: string;
  policyRuleVersion: string;
  humanSignalIds: readonly string[];
  action: 'pause_and_check' | 'seek_routine_professional_input' | 'seek_urgent_professional_input';
  urgency: 'before_next_training' | 'timely' | 'urgent';
  text: string;
}

/** Unverified reviewer note draft; it cannot drive scoring, planning or output. */
export interface NicoleAnatomyExpertNoteV1 {
  noteId: string;
  authorId: string;
  createdAt: string;
  revision: number;
  text: string;
  nonComputational: true;
  internalOnly: true;
  outwardEligibility: false;
}

export interface NicoleAnatomyCaseContextV1 {
  analysisArtifactId: string;
  analysisContextFingerprint: string;
  analysisContextGeneration: number;
  sourceId: string;
  exerciseId: BalletMotionId;
  phaseId: string;
  side: NicoleProBodySide;
  view: NicoleProCaptureView;
  policyVersion: string;
}

export interface NicoleAnatomyProBundleV1 {
  schemaVersion: typeof NICOLE_PRO_ANATOMY_SCHEMA_VERSION;
  bundleId: string;
  contentVersion: number;
  createdAt: string;
  supersedesBundleId: string | null;
  origin: 'ai_suggestion' | 'reviewer_note_draft';
  context: Readonly<NicoleAnatomyCaseContextV1>;
  knowledgeRegistryId: string;
  knowledgeRegistryVersion: string;
  internalOnly: true;
  outwardEligibility: false;
  claimBindings: readonly NicoleAnatomyClaimBindingV1[];
  knowledgeItems: readonly NicoleAnatomyKnowledgeItemV1[];
  claimAnnotations: readonly NicoleAnatomyClaimAnnotationV1[];
  humanSignals: readonly NicoleAnatomyHumanSignalV1[];
  safetyActions: readonly NicoleAnatomySafetyActionV1[];
  expertNotes: readonly NicoleAnatomyExpertNoteV1[];
}

/** The adapter may only project into existing Nicole-Pro claim types. */
export interface NicoleAnatomyPlannerProjectionV1 {
  anatomyAnnotationId: string;
  targetClaimType: Extract<NicoleProClaimType, 'teacher_hypothesis' | 'differentiation_test'>;
  epistemicKind: Extract<
    NicoleAnatomyEpistemicKind,
    'working_hypothesis' | 'counter_hypothesis' | 'differentiation_step'
  >;
}

export type NicoleAnatomyValidationIssueCode =
  | 'invalid_shape'
  | 'unknown_reference'
  | 'invalid_review_state'
  | 'invalid_scientific_status'
  | 'invalid_epistemic_kind'
  | 'case_causality_forbidden'
  | 'missing_counter_hypothesis'
  | 'missing_differentiation_test'
  | 'invalid_test'
  | 'invalid_human_signal'
  | 'invalid_safety_action'
  | 'external_visibility_forbidden'
  | 'non_computational_boundary';

export interface NicoleAnatomyValidationIssueV1 {
  code: NicoleAnatomyValidationIssueCode;
  path: string;
  message: string;
}

export type NicoleAnatomyValidationResultV1 = Readonly<{
  valid: boolean;
  issues: readonly NicoleAnatomyValidationIssueV1[];
}>;
