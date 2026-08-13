import type { BalletMotionId } from './motionRegistry';

export const NICOLE_PRO_CONTENT_SCHEMA_VERSION = 1 as const;

export type NicoleProBodySide = 'left' | 'right' | 'bilateral' | 'center' | 'not_applicable';
export type NicoleProCaptureView = 'frontal' | 'profile_left' | 'profile_right' | 'oblique' | 'undetermined';

/**
 * This status describes the metric contract, not landmark visibility and not
 * Nicole's traffic-light decision.
 */
export type NicoleProMeasurementStatus =
  | 'validated'
  | 'experimental'
  | 'limited'
  | 'qualitative_only'
  | 'not_measurable';

export type NicoleProKnowledgeStatus =
  | 'curated_internal'
  | 'nicole_reviewed'
  | 'externally_validated';

export type NicoleProClaimType =
  | 'visual_observation'
  | 'metric_observation'
  | 'biomechanical_interpretation'
  | 'teacher_hypothesis'
  | 'differentiation_test'
  | 'teaching_target'
  | 'immediate_cue'
  | 'practice'
  | 'success_criterion'
  | 'metaphor'
  | 'technical_limitation'
  | 'clinical_claim';

export type NicoleProMetricUnit =
  | 'deg'
  | 'percent'
  | 'ratio'
  | 'normalized_distance'
  | 'normalized_path'
  | 'qualitative';

export type NicoleProMeasurementUncertainty =
  | Readonly<{
    kind: 'validated_mdc';
    value: number;
    unit: Exclude<NicoleProMetricUnit, 'qualitative'>;
    sourceRef: string;
  }>
  | Readonly<{
    kind: 'estimated_interval';
    lower: number;
    upper: number;
    unit: Exclude<NicoleProMetricUnit, 'qualitative'>;
    methodVersion: string;
  }>
  | Readonly<{ kind: 'not_characterized' }>;

export interface NicoleProLandmarkQualityV1 {
  /** Pose-model visibility only. It is never a measurement-confidence score. */
  status: 'measured' | 'unavailable';
  score: number | null;
  modelId: string;
  modelVersion: string;
}

export interface NicoleProEvidencePacketV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  evidenceId: string;
  analysisArtifactId: string;
  analysisContextFingerprint: string;
  analysisContextGeneration: number;
  sourceId: string;
  exerciseId: BalletMotionId;
  phaseId: string;
  phaseLabel: string;
  phaseConfidence: number;
  cycleIndex: number;
  mediaTimeUs: number;
  frameAuthority: 'exact_cache_frame' | 'phase_aggregate';
  side: NicoleProBodySide;
  view: NicoleProCaptureView;
  videoWidth: number;
  videoHeight: number;
  metricId: string;
  definitionVersion: string;
  measurementStatus: NicoleProMeasurementStatus;
  value: number | null;
  unit: NicoleProMetricUnit;
  uncertainty: NicoleProMeasurementUncertainty;
  captureQuality: 'ready' | 'usable_with_caution' | 'needs_correction';
  landmarkQuality: Readonly<NicoleProLandmarkQualityV1>;
  temporalRepeatability: Readonly<{
    status: 'stable' | 'variable' | 'not_assessed';
    comparableCycleCount: number;
  }>;
  policyVersion: string;
  evidenceSource: 'exact_frame_cache' | 'phase_engine' | 'student_attempt_comparison';
}

export interface NicoleProKnowledgeRuleV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  ruleId: string;
  version: string;
  status: NicoleProKnowledgeStatus;
  permittedClaimTypes: readonly Exclude<NicoleProClaimType, 'clinical_claim'>[];
  conceptIds: readonly string[];
  sourceRefs: readonly string[];
  requiresNicoleCalibration: boolean;
  requiresExternalValidation: boolean;
  /** Trusted semantic statements and their deterministic surface templates. */
  statements: readonly NicoleProKnowledgeStatementV1[];
}

export interface NicoleProKnowledgeStatementV1 {
  statementId: string;
  claimType: Exclude<NicoleProClaimType, 'clinical_claim'>;
  subjectConceptId: string;
  relation: 'observed_as' | 'may_influence' | 'may_be_consistent_with' | 'test_by' | 'target_is' | 'cue_with' | 'practice_with' | 'success_when' | 'imagine_as' | 'limited_by';
  objectConceptId: string;
  modality: 'direct_observation' | 'conditional' | 'possible' | 'instruction' | 'technical_boundary';
  polarity: 'supports' | 'opposes' | 'neutral';
  /** Only differentiation tests link to the hypothesis statements they test. */
  relatedStatementIds: readonly string[];
  evidenceConstraint: Readonly<{
    exerciseIds: readonly BalletMotionId[];
    phaseIds: readonly string[];
    sides: readonly NicoleProBodySide[];
    views: readonly NicoleProCaptureView[];
    metrics: readonly Readonly<{ metricId: string; definitionVersion: string }>[];
    frameAuthorities: readonly NicoleProEvidencePacketV1['frameAuthority'][];
    measurementStatuses: readonly NicoleProMeasurementStatus[];
    captureQualities: readonly NicoleProEvidencePacketV1['captureQuality'][];
    minimumPhaseConfidence: number;
    minimumLandmarkScore: number;
    valuePredicate: Readonly<{
      kind: 'absolute_greater_than';
      threshold: number;
      unit: Exclude<NicoleProMetricUnit, 'qualitative'>;
    }>;
  }>;
  /** Only deterministic placeholders: value, phaseLabel, side and view. */
  textTemplate: string;
}

export interface NicoleProNumericEvidenceReferenceV1 {
  /** The exact Arabic-number token used in claim text, including ° or %. */
  token: string;
  evidenceId: string;
  metricId: string;
  definitionVersion: string;
}

export interface NicoleProClaimV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  claimId: string;
  type: NicoleProClaimType;
  text: string;
  /** The one canonical packet used to project placeholders and numbers. */
  primaryEvidenceId: string;
  semanticKey: string;
  polarity: 'supports' | 'opposes' | 'neutral';
  evidenceIds: readonly string[];
  knowledgeRuleIds: readonly string[];
  conceptIds: readonly string[];
  numericEvidenceRefs: readonly NicoleProNumericEvidenceReferenceV1[];
  relatedClaimIds: readonly string[];
  hypothesisPriority: 1 | 2 | 3 | 4 | null;
  studentEligibility: 'teacher_only' | 'candidate_after_nicole_approval';
  /** Exact statement from the cited trusted registry; text is its deterministic projection. */
  statementId: string;
}

export interface NicoleProTrustedKnowledgeRegistryV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  registryId: string;
  registryVersion: string;
  rules: readonly NicoleProKnowledgeRuleV1[];
}

export interface NicoleProValidationAuthorityV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  expectedAssessment: Readonly<{
    analysisArtifactId: string;
    analysisContextFingerprint: string;
    analysisContextGeneration: number;
    sourceId: string;
    exerciseId: BalletMotionId;
    policyVersion: string;
  }>;
  evidence: readonly NicoleProEvidencePacketV1[];
  knowledgeRegistry: NicoleProTrustedKnowledgeRegistryV1;
}

export interface NicoleProAssessmentAuthorityValueV1 {
  analysisArtifactId: string;
  sourceId: string;
  exerciseId: BalletMotionId;
  policyVersion: string;
  evidence: readonly NicoleProEvidencePacketV1[];
}

export interface NicoleProSectionMapV1 {
  finding: readonly string[];
  interpretation: readonly string[];
  hypotheses: readonly string[];
  differentiationTests: readonly string[];
  targetAndPractice: readonly string[];
  metaphor: readonly string[];
  measurementDetails: readonly string[];
}

export interface NicoleProDraftV1 {
  schemaVersion: typeof NICOLE_PRO_CONTENT_SCHEMA_VERSION;
  draftId: string;
  plannerId: string;
  plannerVersion: string;
  validatorVersion: string;
  policyVersion: string;
  generatedAt: string;
  reviewState: 'pending_nicole';
  learnerVisible: false;
  parentVisible: false;
  evidence: readonly NicoleProEvidencePacketV1[];
  knowledgeRules: readonly NicoleProKnowledgeRuleV1[];
  claims: readonly NicoleProClaimV1[];
  sections: Readonly<NicoleProSectionMapV1>;
}

export type NicoleProValidationIssueCode =
  | 'invalid_shape'
  | 'invalid_evidence'
  | 'invalid_knowledge_rule'
  | 'invalid_claim'
  | 'unknown_reference'
  | 'unsupported_claim_type'
  | 'unsupported_number'
  | 'unsupported_concept'
  | 'forbidden_language'
  | 'missing_differentiation_test'
  | 'contradictory_claims'
  | 'incomplete_content'
  | 'external_visibility_forbidden';

export interface NicoleProValidationIssue {
  code: NicoleProValidationIssueCode;
  path: string;
  message: string;
}

export type NicoleProValidationResult = Readonly<{
  valid: boolean;
  issues: readonly NicoleProValidationIssue[];
}>;
