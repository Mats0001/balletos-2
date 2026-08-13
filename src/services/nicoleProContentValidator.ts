import {
  NICOLE_PRO_CONTENT_SCHEMA_VERSION,
  type NicoleProClaimType,
  type NicoleProClaimV1,
  type NicoleProDraftV1,
  type NicoleProEvidencePacketV1,
  type NicoleProKnowledgeRuleV1,
  type NicoleProKnowledgeStatementV1,
  type NicoleProTrustedKnowledgeRegistryV1,
  type NicoleProValidationAuthorityV1,
  type NicoleProMetricUnit,
  type NicoleProValidationIssue,
  type NicoleProValidationIssueCode,
  type NicoleProValidationResult,
  type NicoleProAssessmentAuthorityValueV1,
} from '../types/nicoleProContent';
import { MOTION_REGISTRY } from './motionRegistry';
import {
  assessmentValueForCurrentContext,
  type AnalysisContextEpochV1,
  type BoundAssessmentV1,
} from './analysisContextGuard';

export const NICOLE_PRO_VALIDATOR_VERSION = 'nicole-pro-validator-v1' as const;
export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID = 'balletos-nicole-pro-knowledge' as const;
export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION = '1.0.0' as const;

const SHOULDER_EVIDENCE_CONSTRAINT: NicoleProKnowledgeStatementV1['evidenceConstraint'] = Object.freeze({
  exerciseIds: Object.freeze(['plie'] as const),
  phaseIds: Object.freeze(['bottom'] as const),
  sides: Object.freeze(['bilateral'] as const),
  views: Object.freeze(['frontal'] as const),
  metrics: Object.freeze([Object.freeze({
    metricId: 'shoulder_horizontal',
    definitionVersion: 'shoulder-horizontal-image-v1',
  })]),
  frameAuthorities: Object.freeze(['exact_cache_frame'] as const),
  measurementStatuses: Object.freeze(['validated', 'experimental', 'limited'] as const),
  captureQualities: Object.freeze(['ready', 'usable_with_caution'] as const),
  minimumPhaseConfidence: 0.5,
  minimumLandmarkScore: 0.3,
  valuePredicate: Object.freeze({ kind: 'absolute_greater_than', threshold: 0, unit: 'deg' }),
});

export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1: NicoleProTrustedKnowledgeRegistryV1 = cloneAndDeepFreeze({
  schemaVersion: 1,
  registryId: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
  registryVersion: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
  rules: Object.freeze([Object.freeze({
    schemaVersion: 1,
    ruleId: 'knowledge:shoulder-line:teacher-v1',
    version: '1.0.0',
    status: 'curated_internal',
    permittedClaimTypes: Object.freeze([
      'visual_observation', 'metric_observation', 'biomechanical_interpretation',
      'teacher_hypothesis', 'differentiation_test', 'teaching_target',
      'immediate_cue', 'practice', 'success_criterion', 'metaphor', 'technical_limitation',
    ] as const),
    conceptIds: Object.freeze(['shoulder_line_continuity', 'teacher_review_action']),
    sourceRefs: Object.freeze(['BalletOS Nicole-Pro knowledge review queue: shoulder line']),
    requiresNicoleCalibration: true,
    requiresExternalValidation: false,
    statements: Object.freeze([
      { statementId: 'statement:finding', claimType: 'visual_observation', subjectConceptId: 'shoulder_line_continuity', relation: 'observed_as', objectConceptId: 'teacher_review_action', modality: 'direct_observation', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Die sichtbare Schulterlinie verändert sich am tiefsten Phasenpunkt.' },
      { statementId: 'statement:metric', claimType: 'metric_observation', subjectConceptId: 'shoulder_line_continuity', relation: 'observed_as', objectConceptId: 'teacher_review_action', modality: 'direct_observation', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Die projizierte Schulterlinie weicht im Bild um {value} ab.' },
      { statementId: 'statement:interpretation', claimType: 'biomechanical_interpretation', subjectConceptId: 'shoulder_line_continuity', relation: 'may_influence', objectConceptId: 'teacher_review_action', modality: 'conditional', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Das kann die sichtbare Organisation von Schultergürtel und Armführung beeinflussen.' },
      { statementId: 'statement:hypothesis', claimType: 'teacher_hypothesis', subjectConceptId: 'shoulder_line_continuity', relation: 'may_be_consistent_with', objectConceptId: 'teacher_review_action', modality: 'possible', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Eine mögliche Erklärung ist das Timing der Arm- und Schulterorganisation.' },
      { statementId: 'statement:test', claimType: 'differentiation_test', subjectConceptId: 'shoulder_line_continuity', relation: 'test_by', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze(['statement:hypothesis']), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Nicole verändert im nächsten Versuch nur die Armhöhe und vergleicht die Schulterlinie.' },
      { statementId: 'statement:target', claimType: 'teaching_target', subjectConceptId: 'shoulder_line_continuity', relation: 'target_is', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Die Schulterlinie soll zur gewählten Phase und zum Épaulement klar organisiert bleiben.' },
      { statementId: 'statement:cue', claimType: 'immediate_cue', subjectConceptId: 'shoulder_line_continuity', relation: 'cue_with', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Schlüsselbeine breit, Ellbogen führt.' },
      { statementId: 'statement:practice', claimType: 'practice', subjectConceptId: 'shoulder_line_continuity', relation: 'practice_with', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Den Übergang langsam wiederholen und nur eine sichtbare Variable verändern.' },
      { statementId: 'statement:success', claimType: 'success_criterion', subjectConceptId: 'shoulder_line_continuity', relation: 'success_when', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Erfolg ist eine wiederholbar ruhigere Schulterlinie bei gleicher Aufgabe.' },
      { statementId: 'statement:metaphor', claimType: 'metaphor', subjectConceptId: 'shoulder_line_continuity', relation: 'imagine_as', objectConceptId: 'teacher_review_action', modality: 'instruction', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Die Schlüsselbeine tragen ein breites, ruhiges Tablett.' },
      { statementId: 'statement:limits', claimType: 'technical_limitation', subjectConceptId: 'shoulder_line_continuity', relation: 'limited_by', objectConceptId: 'teacher_review_action', modality: 'technical_boundary', polarity: 'neutral', relatedStatementIds: Object.freeze([]), evidenceConstraint: SHOULDER_EVIDENCE_CONSTRAINT, textTemplate: 'Die Bildprojektion bestimmt keine individuelle Ursache.' },
    ] as const),
  })]),
});

declare const trustedAuthorityBrand: unique symbol;
export type NicoleProTrustedValidationAuthorityV1 = NicoleProValidationAuthorityV1 & Readonly<{
  [trustedAuthorityBrand]: true;
}>;

const trustedAuthorityDigests = new WeakMap<object, string>();

const CLAIM_TYPES = new Set<NicoleProClaimType>([
  'visual_observation', 'metric_observation', 'biomechanical_interpretation',
  'teacher_hypothesis', 'differentiation_test', 'teaching_target',
  'immediate_cue', 'practice', 'success_criterion', 'metaphor',
  'technical_limitation', 'clinical_claim',
]);

const NUMERIC_UNITS = new Set<NicoleProMetricUnit>([
  'deg', 'percent', 'ratio', 'normalized_distance', 'normalized_path',
]);

const EXERCISE_IDS: ReadonlySet<string> = new Set(MOTION_REGISTRY.map(entry => entry.id));

const RELATION_BY_CLAIM_TYPE: Readonly<Partial<Record<NicoleProClaimType, NicoleProKnowledgeStatementV1['relation']>>> = Object.freeze({
  visual_observation: 'observed_as',
  metric_observation: 'observed_as',
  biomechanical_interpretation: 'may_influence',
  teacher_hypothesis: 'may_be_consistent_with',
  differentiation_test: 'test_by',
  teaching_target: 'target_is',
  immediate_cue: 'cue_with',
  practice: 'practice_with',
  success_criterion: 'success_when',
  metaphor: 'imagine_as',
  technical_limitation: 'limited_by',
});

const EVIDENCE_REQUIRED = new Set<NicoleProClaimType>([
  'visual_observation', 'metric_observation', 'biomechanical_interpretation',
  'teacher_hypothesis', 'differentiation_test', 'teaching_target',
  'immediate_cue', 'practice', 'success_criterion', 'metaphor', 'technical_limitation',
]);

const KNOWLEDGE_REQUIRED = new Set<NicoleProClaimType>([
  'visual_observation', 'metric_observation', 'biomechanical_interpretation',
  'teacher_hypothesis', 'differentiation_test', 'teaching_target',
  'immediate_cue', 'practice', 'success_criterion', 'metaphor', 'technical_limitation',
]);

const ALWAYS_TEACHER_ONLY = new Set<NicoleProClaimType>([
  'metric_observation', 'teacher_hypothesis', 'differentiation_test',
  'technical_limitation', 'clinical_claim',
]);

const NUMBER_TOKEN = /(?<![\p{L}\p{N}_])[-+]?\d+(?:[.,]\d+)?(?:\s?(?:°|%))?(?![\p{L}\p{N}_])/gu;
const TEMPLATE_PLACEHOLDER = /\{(value|phaseLabel|side|view)\}/g;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function cloneAndDeepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => cloneAndDeepFreeze(item))) as unknown as T;
  }
  if (isObject(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneAndDeepFreeze(item)]),
    )) as T;
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowlist = new Set(allowed);
  return Object.keys(value).every(key => allowlist.has(key));
}

function finiteUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function issue(
  issues: NicoleProValidationIssue[],
  code: NicoleProValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ code, path, message }));
}

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateUncertainty(
  evidence: NicoleProEvidencePacketV1,
  path: string,
  issues: NicoleProValidationIssue[],
): void {
  const uncertainty = evidence.uncertainty;
  if (!isObject(uncertainty) || !nonEmptyString(uncertainty.kind)) {
    issue(issues, 'invalid_evidence', `${path}.uncertainty`, 'Measurement uncertainty must be explicit.');
    return;
  }
  if (uncertainty.kind === 'not_characterized') {
    if (!hasOnlyKeys(uncertainty, ['kind'])) issue(issues, 'invalid_evidence', `${path}.uncertainty`, 'Uncertainty contains unknown fields.');
    return;
  }
  if (uncertainty.kind === 'validated_mdc') {
    if (!hasOnlyKeys(uncertainty, ['kind', 'value', 'unit', 'sourceRef'])
      || evidence.measurementStatus !== 'validated'
      || typeof uncertainty.value !== 'number'
      || !Number.isFinite(uncertainty.value)
      || uncertainty.value <= 0
      || uncertainty.unit !== evidence.unit
      || !nonEmptyString(uncertainty.sourceRef)) {
      issue(issues, 'invalid_evidence', `${path}.uncertainty`, 'Validated MDC requires a validated metric, matching unit and source.');
    }
    return;
  }
  if (uncertainty.kind === 'estimated_interval') {
    if (!hasOnlyKeys(uncertainty, ['kind', 'lower', 'upper', 'unit', 'methodVersion'])
      || !['experimental', 'limited'].includes(evidence.measurementStatus)
      || typeof uncertainty.lower !== 'number'
      || typeof uncertainty.upper !== 'number'
      || !Number.isFinite(uncertainty.lower)
      || !Number.isFinite(uncertainty.upper)
      || uncertainty.lower > uncertainty.upper
      || typeof evidence.value !== 'number'
      || evidence.value < uncertainty.lower
      || evidence.value > uncertainty.upper
      || uncertainty.unit !== evidence.unit
      || !nonEmptyString(uncertainty.methodVersion)) {
      issue(issues, 'invalid_evidence', `${path}.uncertainty`, 'Estimated intervals require an experimental/limited metric and matching finite bounds.');
    }
    return;
  }
  issue(issues, 'invalid_evidence', `${path}.uncertainty.kind`, 'Unknown uncertainty kind.');
}

function validateEvidence(
  value: unknown,
  index: number,
  issues: NicoleProValidationIssue[],
): value is NicoleProEvidencePacketV1 {
  const path = `evidence[${index}]`;
  if (!isObject(value)) {
    issue(issues, 'invalid_evidence', path, 'Evidence must be an object.');
    return false;
  }
  const evidence = value as unknown as NicoleProEvidencePacketV1;
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'evidenceId', 'analysisArtifactId', 'analysisContextFingerprint',
    'analysisContextGeneration', 'sourceId', 'exerciseId', 'phaseId', 'phaseLabel',
    'phaseConfidence', 'cycleIndex', 'mediaTimeUs', 'frameAuthority', 'side', 'view',
    'videoWidth', 'videoHeight', 'metricId', 'definitionVersion', 'measurementStatus',
    'value', 'unit', 'uncertainty', 'captureQuality', 'landmarkQuality',
    'temporalRepeatability', 'policyVersion', 'evidenceSource',
  ])) {
    issue(issues, 'invalid_evidence', path, 'Evidence contains unknown fields.');
  }
  const strings = [
    evidence.evidenceId, evidence.analysisArtifactId, evidence.analysisContextFingerprint,
    evidence.sourceId, evidence.exerciseId, evidence.phaseId, evidence.phaseLabel,
    evidence.metricId, evidence.definitionVersion, evidence.policyVersion,
  ];
  if (evidence.schemaVersion !== NICOLE_PRO_CONTENT_SCHEMA_VERSION
    || strings.some(item => !nonEmptyString(item))
    || !EXERCISE_IDS.has(evidence.exerciseId)
    || !positiveInteger(evidence.analysisContextGeneration)
    || !finiteUnitInterval(evidence.phaseConfidence)
    || !positiveInteger(evidence.cycleIndex)
    || !positiveInteger(evidence.mediaTimeUs)
    || !Number.isFinite(evidence.videoWidth) || evidence.videoWidth <= 0
    || !Number.isFinite(evidence.videoHeight) || evidence.videoHeight <= 0) {
    issue(issues, 'invalid_evidence', path, 'Evidence identity, frame, phase and dimensions must be complete and finite.');
  }
  if (!['exact_cache_frame', 'phase_aggregate'].includes(evidence.frameAuthority)
    || !['left', 'right', 'bilateral', 'center', 'not_applicable'].includes(evidence.side)
    || !['frontal', 'profile_left', 'profile_right', 'oblique', 'undetermined'].includes(evidence.view)
    || !['validated', 'experimental', 'limited', 'qualitative_only', 'not_measurable'].includes(evidence.measurementStatus)
    || !['ready', 'usable_with_caution', 'needs_correction'].includes(evidence.captureQuality)
    || !['exact_frame_cache', 'phase_engine', 'student_attempt_comparison'].includes(evidence.evidenceSource)) {
    issue(issues, 'invalid_evidence', path, 'Evidence contains an unknown contract status.');
  }
  const numericMeasurement = ['validated', 'experimental', 'limited'].includes(evidence.measurementStatus);
  if (numericMeasurement) {
    if (typeof evidence.value !== 'number' || !Number.isFinite(evidence.value) || !NUMERIC_UNITS.has(evidence.unit)) {
      issue(issues, 'invalid_evidence', path, 'Numeric metric status requires a finite value and numeric unit.');
    }
  } else if (evidence.value !== null || evidence.unit !== 'qualitative') {
    issue(issues, 'invalid_evidence', path, 'Qualitative/not-measurable evidence must not carry a numeric value or unit.');
  }
  if (evidence.measurementStatus === 'validated' && evidence.uncertainty?.kind !== 'validated_mdc') {
    issue(issues, 'invalid_evidence', `${path}.uncertainty`, 'Validated metrics require a sourced minimal detectable change.');
  }
  if (!isObject(evidence.landmarkQuality)
    || !hasOnlyKeys(evidence.landmarkQuality, ['status', 'score', 'modelId', 'modelVersion'])
    || !['measured', 'unavailable'].includes(evidence.landmarkQuality.status)
    || !nonEmptyString(evidence.landmarkQuality.modelId)
    || !nonEmptyString(evidence.landmarkQuality.modelVersion)
    || (evidence.landmarkQuality.status === 'measured'
      && (!finiteUnitInterval(evidence.landmarkQuality.score) || evidence.landmarkQuality.score <= 0))
    || (evidence.landmarkQuality.status === 'unavailable' && evidence.landmarkQuality.score !== null)) {
    issue(issues, 'invalid_evidence', `${path}.landmarkQuality`, 'Landmark visibility is a separate, explicit model-quality fact.');
  }
  if (evidence.landmarkQuality?.status === 'unavailable' && numericMeasurement) {
    issue(issues, 'invalid_evidence', `${path}.landmarkQuality`, 'Unavailable landmarks cannot support a landmark-derived numeric metric.');
  }
  if (evidence.captureQuality === 'needs_correction' && evidence.measurementStatus !== 'not_measurable') {
    issue(issues, 'invalid_evidence', `${path}.captureQuality`, 'A blocked recording cannot support a movement measurement.');
  }
  if (!isObject(evidence.temporalRepeatability)
    || !hasOnlyKeys(evidence.temporalRepeatability, ['status', 'comparableCycleCount'])
    || !['stable', 'variable', 'not_assessed'].includes(evidence.temporalRepeatability.status)
    || !positiveInteger(evidence.temporalRepeatability.comparableCycleCount)) {
    issue(issues, 'invalid_evidence', `${path}.temporalRepeatability`, 'Temporal repeatability must be explicit.');
  } else if (evidence.temporalRepeatability.status !== 'not_assessed'
    && evidence.temporalRepeatability.comparableCycleCount < 2) {
    issue(issues, 'invalid_evidence', `${path}.temporalRepeatability`, 'Stable or variable repeatability requires at least two comparable cycles.');
  } else if (evidence.temporalRepeatability.status === 'not_assessed'
    && evidence.temporalRepeatability.comparableCycleCount > 1) {
    issue(issues, 'invalid_evidence', `${path}.temporalRepeatability`, 'Unassessed repeatability cannot claim multiple comparable cycles.');
  }
  if ((evidence.frameAuthority === 'exact_cache_frame') !== (evidence.evidenceSource === 'exact_frame_cache')) {
    issue(issues, 'invalid_evidence', `${path}.frameAuthority`, 'Exact frame authority and evidence source must agree.');
  }
  validateUncertainty(evidence, path, issues);
  return true;
}

function validateStatement(
  statement: unknown,
  path: string,
  rule: NicoleProKnowledgeRuleV1,
  issues: NicoleProValidationIssue[],
): statement is NicoleProKnowledgeStatementV1 {
  const evidenceConstraint = isObject(statement) ? statement.evidenceConstraint : null;
  if (!isObject(statement)
    || !hasOnlyKeys(statement, [
      'statementId', 'claimType', 'subjectConceptId', 'relation', 'objectConceptId',
      'modality', 'polarity', 'relatedStatementIds', 'evidenceConstraint', 'textTemplate',
    ])
    || !nonEmptyString(statement.statementId)
    || !CLAIM_TYPES.has(statement.claimType as NicoleProClaimType)
    || statement.claimType === 'clinical_claim'
    || !nonEmptyString(statement.subjectConceptId)
    || !['observed_as', 'may_influence', 'may_be_consistent_with', 'test_by', 'target_is', 'cue_with', 'practice_with', 'success_when', 'imagine_as', 'limited_by'].includes(String(statement.relation))
    || !nonEmptyString(statement.objectConceptId)
    || !['direct_observation', 'conditional', 'possible', 'instruction', 'technical_boundary'].includes(String(statement.modality))
    || !['supports', 'opposes', 'neutral'].includes(String(statement.polarity))
    || !Array.isArray(statement.relatedStatementIds)
    || statement.relatedStatementIds.some(item => !nonEmptyString(item))
    || (statement.claimType !== 'differentiation_test' && statement.relatedStatementIds.length > 0)
    || !isObject(evidenceConstraint)
    || !hasOnlyKeys(evidenceConstraint, [
      'exerciseIds', 'phaseIds', 'sides', 'views', 'metrics', 'frameAuthorities',
      'measurementStatuses', 'captureQualities', 'minimumPhaseConfidence',
      'minimumLandmarkScore', 'valuePredicate',
    ])
    || !Array.isArray(evidenceConstraint.exerciseIds) || evidenceConstraint.exerciseIds.length === 0
    || evidenceConstraint.exerciseIds.some(item => !EXERCISE_IDS.has(String(item)))
    || !Array.isArray(evidenceConstraint.phaseIds) || evidenceConstraint.phaseIds.length === 0 || evidenceConstraint.phaseIds.some(item => !nonEmptyString(item))
    || !Array.isArray(evidenceConstraint.sides) || evidenceConstraint.sides.length === 0 || evidenceConstraint.sides.some(item => !['left', 'right', 'bilateral', 'center', 'not_applicable'].includes(String(item)))
    || !Array.isArray(evidenceConstraint.views) || evidenceConstraint.views.length === 0 || evidenceConstraint.views.some(item => !['frontal', 'profile_left', 'profile_right', 'oblique', 'undetermined'].includes(String(item)))
    || !Array.isArray(evidenceConstraint.metrics) || evidenceConstraint.metrics.length === 0
    || evidenceConstraint.metrics.some(item => !isObject(item)
      || !hasOnlyKeys(item, ['metricId', 'definitionVersion'])
      || !nonEmptyString(item.metricId) || !nonEmptyString(item.definitionVersion))
    || !Array.isArray(evidenceConstraint.frameAuthorities) || evidenceConstraint.frameAuthorities.length === 0 || evidenceConstraint.frameAuthorities.some(item => !['exact_cache_frame', 'phase_aggregate'].includes(String(item)))
    || !Array.isArray(evidenceConstraint.measurementStatuses) || evidenceConstraint.measurementStatuses.length === 0
    || evidenceConstraint.measurementStatuses.some(item => !['validated', 'experimental', 'limited', 'qualitative_only', 'not_measurable'].includes(String(item)))
    || !Array.isArray(evidenceConstraint.captureQualities) || evidenceConstraint.captureQualities.length === 0
    || evidenceConstraint.captureQualities.some(item => !['ready', 'usable_with_caution', 'needs_correction'].includes(String(item)))
    || !finiteUnitInterval(evidenceConstraint.minimumPhaseConfidence)
    || !finiteUnitInterval(evidenceConstraint.minimumLandmarkScore)
    || !isObject(evidenceConstraint.valuePredicate)
    || !hasOnlyKeys(evidenceConstraint.valuePredicate, ['kind', 'threshold', 'unit'])
    || evidenceConstraint.valuePredicate.kind !== 'absolute_greater_than'
    || typeof evidenceConstraint.valuePredicate.threshold !== 'number'
    || !Number.isFinite(evidenceConstraint.valuePredicate.threshold)
    || !NUMERIC_UNITS.has(evidenceConstraint.valuePredicate.unit as NicoleProMetricUnit)
    || !nonEmptyString(statement.textTemplate)
    || !rule.permittedClaimTypes.includes(statement.claimType as Exclude<NicoleProClaimType, 'clinical_claim'>)
    || RELATION_BY_CLAIM_TYPE[statement.claimType as NicoleProClaimType] !== statement.relation
    || !rule.conceptIds.includes(statement.subjectConceptId)
    || !rule.conceptIds.includes(statement.objectConceptId)) {
    issue(issues, 'invalid_knowledge_rule', path, 'Knowledge statement is outside its rule contract.');
    return false;
  }
  const stripped = statement.textTemplate.replace(TEMPLATE_PLACEHOLDER, '');
  if (/[{}]/.test(stripped) || (stripped.match(NUMBER_TOKEN) ?? []).length > 0) {
    issue(issues, 'invalid_knowledge_rule', `${path}.textTemplate`, 'Knowledge template contains an unknown placeholder.');
  }
  return true;
}

function validateKnowledgeRule(
  value: unknown,
  index: number,
  issues: NicoleProValidationIssue[],
): value is NicoleProKnowledgeRuleV1 {
  const path = `knowledgeRules[${index}]`;
  if (!isObject(value)) {
    issue(issues, 'invalid_knowledge_rule', path, 'Knowledge rule must be an object.');
    return false;
  }
  const rule = value as unknown as NicoleProKnowledgeRuleV1;
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'ruleId', 'version', 'status', 'permittedClaimTypes', 'conceptIds',
    'sourceRefs', 'requiresNicoleCalibration', 'requiresExternalValidation', 'statements',
  ])
    || rule.schemaVersion !== 1 || !nonEmptyString(rule.ruleId) || !nonEmptyString(rule.version)
    || !['curated_internal', 'nicole_reviewed', 'externally_validated'].includes(rule.status)
    || !Array.isArray(rule.permittedClaimTypes) || rule.permittedClaimTypes.length === 0
    || rule.permittedClaimTypes.some(type => !CLAIM_TYPES.has(type) || type === 'clinical_claim')
    || !Array.isArray(rule.conceptIds) || rule.conceptIds.some(item => !nonEmptyString(item))
    || !Array.isArray(rule.sourceRefs) || rule.sourceRefs.length === 0 || rule.sourceRefs.some(item => !nonEmptyString(item))
    || typeof rule.requiresNicoleCalibration !== 'boolean'
    || typeof rule.requiresExternalValidation !== 'boolean'
    || !Array.isArray(rule.statements) || rule.statements.length === 0) {
    issue(issues, 'invalid_knowledge_rule', path, 'Knowledge rule is incomplete or permits a blocked claim type.');
    return true;
  }
  rule.statements.forEach((statement, statementIndex) => validateStatement(statement, `${path}.statements[${statementIndex}]`, rule, issues));
  if (duplicateValues(rule.statements.filter(isObject).map(statement => String(statement.statementId))).length > 0) {
    issue(issues, 'invalid_knowledge_rule', `${path}.statements`, 'Knowledge statement IDs must be unique.');
  }
  const statementById = new Map(rule.statements.map(statement => [statement.statementId, statement]));
  for (const statement of rule.statements) {
    if (statement.claimType !== 'differentiation_test') continue;
    if (statement.relatedStatementIds.length === 0 || statement.relatedStatementIds.some((statementId: string) => (
      statementById.get(statementId)?.claimType !== 'teacher_hypothesis'
    ))) {
      issue(issues, 'invalid_knowledge_rule', `${path}.statements`, 'Differentiation-test statements must link to hypotheses in the same rule.');
    }
  }
  return true;
}

function displayValue(evidence: NicoleProEvidencePacketV1): string | null {
  if (typeof evidence.value !== 'number') return null;
  const normalized = Number.isInteger(evidence.value)
    ? String(evidence.value)
    : String(evidence.value).replace('.', ',');
  if (evidence.unit === 'deg') return `${normalized}°`;
  if (evidence.unit === 'percent') return `${normalized}%`;
  return normalized;
}

function renderStatement(statement: NicoleProKnowledgeStatementV1, evidence: NicoleProEvidencePacketV1): string | null {
  const value = displayValue(evidence);
  if (statement.textTemplate.includes('{value}') && value === null) return null;
  return statement.textTemplate
    .split('{value}').join(value ?? '')
    .split('{phaseLabel}').join(evidence.phaseLabel)
    .split('{side}').join(evidence.side)
    .split('{view}').join(evidence.view);
}

function evidenceMatchesStatement(
  evidence: NicoleProEvidencePacketV1,
  statement: NicoleProKnowledgeStatementV1,
): boolean {
  const constraint = statement.evidenceConstraint;
  return constraint.exerciseIds.includes(evidence.exerciseId)
    && constraint.phaseIds.includes(evidence.phaseId)
    && constraint.sides.includes(evidence.side)
    && constraint.views.includes(evidence.view)
    && constraint.metrics.some(metric => (
      metric.metricId === evidence.metricId && metric.definitionVersion === evidence.definitionVersion
    ))
    && constraint.frameAuthorities.includes(evidence.frameAuthority)
    && constraint.measurementStatuses.includes(evidence.measurementStatus)
    && constraint.captureQualities.includes(evidence.captureQuality)
    && evidence.phaseConfidence >= constraint.minimumPhaseConfidence
    && evidence.landmarkQuality.status === 'measured'
    && typeof evidence.landmarkQuality.score === 'number'
    && evidence.landmarkQuality.score >= constraint.minimumLandmarkScore
    && typeof evidence.value === 'number'
    && evidence.unit === constraint.valuePredicate.unit
    && Math.abs(evidence.value) > constraint.valuePredicate.threshold;
}

function numericValueFromToken(token: string): number | null {
  const match = token.replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function unitMatchesToken(unit: NicoleProMetricUnit, token: string): boolean {
  if (token.includes('°')) return unit === 'deg';
  if (token.includes('%')) return unit === 'percent';
  return unit !== 'deg' && unit !== 'percent';
}

function validateClaim(
  value: unknown,
  index: number,
  evidenceById: ReadonlyMap<string, NicoleProEvidencePacketV1>,
  ruleById: ReadonlyMap<string, NicoleProKnowledgeRuleV1>,
  trustedRuleById: ReadonlyMap<string, NicoleProKnowledgeRuleV1>,
  issues: NicoleProValidationIssue[],
): value is NicoleProClaimV1 {
  const path = `claims[${index}]`;
  if (!isObject(value)) {
    issue(issues, 'invalid_claim', path, 'Claim must be an object.');
    return false;
  }
  const claim = value as unknown as NicoleProClaimV1;
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'claimId', 'type', 'text', 'primaryEvidenceId', 'semanticKey',
    'polarity', 'evidenceIds', 'knowledgeRuleIds', 'conceptIds', 'numericEvidenceRefs',
    'relatedClaimIds', 'hypothesisPriority', 'studentEligibility', 'statementId',
  ])
    || claim.schemaVersion !== 1 || !nonEmptyString(claim.claimId) || !CLAIM_TYPES.has(claim.type)
    || !nonEmptyString(claim.text) || !nonEmptyString(claim.primaryEvidenceId) || !nonEmptyString(claim.semanticKey)
    || !['supports', 'opposes', 'neutral'].includes(claim.polarity)
    || !Array.isArray(claim.evidenceIds) || !Array.isArray(claim.knowledgeRuleIds)
    || !Array.isArray(claim.conceptIds) || !Array.isArray(claim.numericEvidenceRefs)
    || !Array.isArray(claim.relatedClaimIds)
    || !['teacher_only', 'candidate_after_nicole_approval'].includes(claim.studentEligibility)
    || !nonEmptyString(claim.statementId)) {
    issue(issues, 'invalid_claim', path, 'Claim shape is incomplete.');
    return true;
  }
  if (claim.type === 'clinical_claim') {
    issue(issues, 'unsupported_claim_type', `${path}.type`, 'Clinical claims are disabled in Nicole-Pro V1.');
  }
  if (EVIDENCE_REQUIRED.has(claim.type) && claim.evidenceIds.length === 0) {
    issue(issues, 'invalid_claim', `${path}.evidenceIds`, 'This claim type requires evidence.');
  }
  if (!claim.evidenceIds.includes(claim.primaryEvidenceId)) {
    issue(issues, 'invalid_claim', `${path}.primaryEvidenceId`, 'Primary evidence must be cited by the claim.');
  }
  if (duplicateValues(claim.evidenceIds).length > 0 || duplicateValues(claim.knowledgeRuleIds).length > 0
    || duplicateValues(claim.conceptIds).length > 0 || duplicateValues(claim.relatedClaimIds).length > 0) {
    issue(issues, 'invalid_claim', path, 'Claim reference lists must not contain duplicates.');
  }
  if (KNOWLEDGE_REQUIRED.has(claim.type) && claim.knowledgeRuleIds.length === 0) {
    issue(issues, 'invalid_claim', `${path}.knowledgeRuleIds`, 'This claim type requires a versioned knowledge rule.');
  }
  for (const evidenceId of claim.evidenceIds) {
    if (!evidenceById.has(evidenceId)) issue(issues, 'unknown_reference', `${path}.evidenceIds`, `Unknown evidence ${evidenceId}.`);
  }
  const permittedConcepts = new Set<string>();
  for (const ruleId of claim.knowledgeRuleIds) {
    const rule = ruleById.get(ruleId);
    const trustedRule = trustedRuleById.get(ruleId);
    if (!rule) {
      issue(issues, 'unknown_reference', `${path}.knowledgeRuleIds`, `Unknown knowledge rule ${ruleId}.`);
      continue;
    }
    if (!trustedRule || canonicalJson(rule) !== canonicalJson(trustedRule)) {
      issue(issues, 'invalid_knowledge_rule', `${path}.knowledgeRuleIds`, `Knowledge rule ${ruleId} is not the trusted registry version.`);
      continue;
    }
    if (!rule.permittedClaimTypes.includes(claim.type as Exclude<NicoleProClaimType, 'clinical_claim'>)) {
      issue(issues, 'unsupported_claim_type', `${path}.type`, `Knowledge rule ${ruleId} does not permit ${claim.type}.`);
    }
    if (rule.requiresExternalValidation && rule.status !== 'externally_validated') {
      issue(issues, 'unsupported_claim_type', `${path}.knowledgeRuleIds`, `Knowledge rule ${ruleId} requires external validation before use.`);
    }
    rule.conceptIds.forEach(concept => permittedConcepts.add(concept));
  }
  const matchingStatements = claim.knowledgeRuleIds.flatMap(ruleId => trustedRuleById.get(ruleId)?.statements ?? [])
    .filter(statement => statement.statementId === claim.statementId);
  if (matchingStatements.length !== 1 || matchingStatements[0].claimType !== claim.type) {
    issue(issues, 'invalid_knowledge_rule', `${path}.statementId`, 'Claim must cite exactly one trusted statement of the same type.');
  } else {
    const primaryEvidence = evidenceById.get(claim.primaryEvidenceId);
    const projectedText = primaryEvidence ? renderStatement(matchingStatements[0], primaryEvidence) : null;
    if (!projectedText || claim.text !== projectedText) {
      issue(issues, 'forbidden_language', `${path}.text`, 'Claim text must be the deterministic projection of its trusted statement.');
    }
    if (claim.semanticKey !== `${matchingStatements[0].subjectConceptId}:${matchingStatements[0].relation}:${matchingStatements[0].objectConceptId}`) {
      issue(issues, 'invalid_claim', `${path}.semanticKey`, 'Semantic key must be derived from the trusted statement.');
    }
    if (claim.polarity !== matchingStatements[0].polarity) {
      issue(issues, 'invalid_claim', `${path}.polarity`, 'Claim polarity must be derived from the trusted statement.');
    }
    if (!primaryEvidence || !evidenceMatchesStatement(primaryEvidence, matchingStatements[0])
      || claim.evidenceIds.some(evidenceId => {
        const citedEvidence = evidenceById.get(evidenceId);
        return !citedEvidence || !evidenceMatchesStatement(citedEvidence, matchingStatements[0]);
      })) {
      issue(issues, 'invalid_evidence', `${path}.evidenceIds`, 'Claim evidence is outside the trusted statement constraint.');
    }
    const expectedConcepts = new Set([
      matchingStatements[0].subjectConceptId,
      matchingStatements[0].objectConceptId,
    ]);
    if (claim.conceptIds.length !== expectedConcepts.size
      || claim.conceptIds.some(conceptId => !expectedConcepts.has(conceptId))) {
      issue(issues, 'unsupported_concept', `${path}.conceptIds`, 'Claim concepts must exactly match the trusted statement.');
    }
  }
  for (const conceptId of claim.conceptIds) {
    if (!permittedConcepts.has(conceptId)) {
      issue(issues, 'unsupported_concept', `${path}.conceptIds`, `Concept ${conceptId} is not allowed by the cited knowledge rules.`);
    }
  }
  const primaryEvidenceForNumbers = evidenceById.get(claim.primaryEvidenceId);
  const numericScanText = matchingStatements.length === 1 && primaryEvidenceForNumbers
    ? renderStatement({
      ...matchingStatements[0],
      textTemplate: matchingStatements[0].textTemplate.split('{phaseLabel}').join(''),
    }, primaryEvidenceForNumbers) ?? claim.text
    : claim.text;
  const textTokens = numericScanText.match(NUMBER_TOKEN) ?? [];
  const referencedTokens = new Set(claim.numericEvidenceRefs.map(reference => reference.token));
  for (const token of textTokens) {
    if (!referencedTokens.has(token)) {
      issue(issues, 'unsupported_number', `${path}.text`, `Number ${token} is not bound to metric evidence.`);
    }
  }
  for (const reference of claim.numericEvidenceRefs) {
    if (!isObject(reference) || !hasOnlyKeys(reference, ['token', 'evidenceId', 'metricId', 'definitionVersion'])
      || !nonEmptyString(reference.token) || !nonEmptyString(reference.evidenceId)
      || !nonEmptyString(reference.metricId) || !nonEmptyString(reference.definitionVersion)) {
      issue(issues, 'unsupported_number', `${path}.numericEvidenceRefs`, 'Numeric reference shape is invalid.');
      continue;
    }
    const evidence = evidenceById.get(reference.evidenceId);
    const numberValue = numericValueFromToken(reference.token);
    if (!evidence
      || reference.evidenceId !== claim.primaryEvidenceId
      || !claim.evidenceIds.includes(reference.evidenceId)
      || evidence.metricId !== reference.metricId
      || evidence.definitionVersion !== reference.definitionVersion
      || typeof evidence.value !== 'number'
      || numberValue === null
      || Math.abs(numberValue - evidence.value) > 1e-9
      || !unitMatchesToken(evidence.unit, reference.token)
      || !claim.text.includes(reference.token)) {
      issue(issues, 'unsupported_number', `${path}.numericEvidenceRefs`, 'Numeric reference does not exactly match cited metric evidence.');
    }
  }
  if (claim.type === 'teacher_hypothesis') {
    if (claim.hypothesisPriority === null || ![1, 2, 3, 4].includes(claim.hypothesisPriority)) {
      issue(issues, 'invalid_claim', `${path}.hypothesisPriority`, 'Teacher hypotheses require priority 1–4.');
    }
  } else if (claim.hypothesisPriority !== null) {
    issue(issues, 'invalid_claim', `${path}.hypothesisPriority`, 'Only teacher hypotheses may have a priority.');
  }
  if (claim.type !== 'differentiation_test' && claim.relatedClaimIds.length > 0) {
    issue(issues, 'invalid_claim', `${path}.relatedClaimIds`, 'Only differentiation tests may link related claims.');
  }
  const numericReferenceKeys = claim.numericEvidenceRefs.filter(isObject).map(reference => (
    `${String(reference.token)}|${String(reference.evidenceId)}|${String(reference.metricId)}|${String(reference.definitionVersion)}`
  ));
  if (duplicateValues(numericReferenceKeys).length > 0) {
    issue(issues, 'unsupported_number', `${path}.numericEvidenceRefs`, 'Numeric evidence references must be unique.');
  }
  if (ALWAYS_TEACHER_ONLY.has(claim.type) && claim.studentEligibility !== 'teacher_only') {
    issue(issues, 'invalid_claim', `${path}.studentEligibility`, `${claim.type} must remain teacher-only.`);
  }
  return true;
}

const SECTION_CONTRACTS: Readonly<Record<string, Readonly<{
  allowed: ReadonlySet<NicoleProClaimType>;
  required: ReadonlySet<NicoleProClaimType>;
}>>> = Object.freeze({
  finding: { allowed: new Set<NicoleProClaimType>(['visual_observation', 'metric_observation']), required: new Set<NicoleProClaimType>(['visual_observation']) },
  interpretation: { allowed: new Set<NicoleProClaimType>(['biomechanical_interpretation']), required: new Set<NicoleProClaimType>(['biomechanical_interpretation']) },
  hypotheses: { allowed: new Set<NicoleProClaimType>(['teacher_hypothesis']), required: new Set<NicoleProClaimType>(['teacher_hypothesis']) },
  differentiationTests: { allowed: new Set<NicoleProClaimType>(['differentiation_test']), required: new Set<NicoleProClaimType>(['differentiation_test']) },
  targetAndPractice: {
    allowed: new Set<NicoleProClaimType>(['teaching_target', 'immediate_cue', 'practice', 'success_criterion']),
    required: new Set<NicoleProClaimType>(['teaching_target', 'immediate_cue', 'practice', 'success_criterion']),
  },
  metaphor: { allowed: new Set<NicoleProClaimType>(['metaphor']), required: new Set<NicoleProClaimType>(['metaphor']) },
  measurementDetails: { allowed: new Set<NicoleProClaimType>(['metric_observation', 'technical_limitation']), required: new Set<NicoleProClaimType>(['technical_limitation']) },
});

function validateSections(
  value: unknown,
  claimById: ReadonlyMap<string, NicoleProClaimV1>,
  issues: NicoleProValidationIssue[],
): void {
  if (!isObject(value)) {
    issue(issues, 'incomplete_content', 'sections', 'Nicole-Pro sections are missing.');
    return;
  }
  if (!hasOnlyKeys(value, Object.keys(SECTION_CONTRACTS))) {
    issue(issues, 'incomplete_content', 'sections', 'Sections contain unknown fields.');
  }
  for (const [section, contract] of Object.entries(SECTION_CONTRACTS)) {
    const ids = value[section];
    if (!Array.isArray(ids) || ids.length === 0 || ids.some(item => !nonEmptyString(item))) {
      issue(issues, 'incomplete_content', `sections.${section}`, 'Every Nicole-Pro section requires at least one claim.');
      continue;
    }
    for (const id of ids) {
      const claim = claimById.get(id);
      if (!claim) issue(issues, 'unknown_reference', `sections.${section}`, `Unknown claim ${id}.`);
      else if (!contract.allowed.has(claim.type)) issue(issues, 'invalid_claim', `sections.${section}`, `${claim.type} is not allowed in ${section}.`);
    }
    const presentTypes = new Set(ids.map(id => claimById.get(id)?.type).filter(Boolean));
    for (const requiredType of contract.required) {
      if (!presentTypes.has(requiredType)) {
        issue(issues, 'incomplete_content', `sections.${section}`, `${section} requires ${requiredType}.`);
      }
    }
  }
}

function validateHypothesisTests(
  claims: readonly NicoleProClaimV1[],
  trustedRuleById: ReadonlyMap<string, NicoleProKnowledgeRuleV1>,
  issues: NicoleProValidationIssue[],
): void {
  const hypothesisById = new Map(claims.filter(claim => claim.type === 'teacher_hypothesis').map(claim => [claim.claimId, claim]));
  const hypothesisIds = new Set(hypothesisById.keys());
  const testedIds = new Set(
    claims.filter(claim => claim.type === 'differentiation_test').flatMap(claim => claim.relatedClaimIds),
  );
  for (const hypothesisId of hypothesisIds) {
    if (!testedIds.has(hypothesisId)) {
      issue(issues, 'missing_differentiation_test', 'claims', `Hypothesis ${hypothesisId} has no differentiation test.`);
    }
  }
  for (const test of claims.filter(claim => claim.type === 'differentiation_test')) {
    if (test.relatedClaimIds.length === 0 || test.relatedClaimIds.some(id => !hypothesisIds.has(id))) {
      issue(issues, 'unknown_reference', `claims.${test.claimId}.relatedClaimIds`, 'Differentiation tests may reference teacher hypotheses only.');
      continue;
    }
    for (const hypothesisId of test.relatedClaimIds) {
      const hypothesis = hypothesisById.get(hypothesisId);
      const sharedRuleIds = test.knowledgeRuleIds.filter(ruleId => hypothesis?.knowledgeRuleIds.includes(ruleId));
      const isCompatible = Boolean(hypothesis
        && test.primaryEvidenceId === hypothesis.primaryEvidenceId
        && sharedRuleIds.some(ruleId => {
          const testStatement = trustedRuleById.get(ruleId)?.statements.find(statement => statement.statementId === test.statementId);
          return testStatement?.claimType === 'differentiation_test'
            && testStatement.relatedStatementIds.includes(hypothesis.statementId);
        }));
      if (!isCompatible) {
        issue(issues, 'missing_differentiation_test', `claims.${test.claimId}`, `Test ${test.claimId} is not a trusted differentiation for ${hypothesisId}.`);
      }
    }
  }
  const priorities = claims.filter(claim => claim.type === 'teacher_hypothesis').map(claim => claim.hypothesisPriority as number);
  const orderedPriorities = [...priorities].sort((left, right) => left - right);
  const contiguous = orderedPriorities.every((priority, index) => priority === index + 1);
  if (priorities.length < 1 || priorities.length > 4 || !contiguous) {
    issue(issues, 'incomplete_content', 'claims', 'Nicole-Pro requires one to four uniquely prioritized teacher hypotheses.');
  }
}

function validateContradictions(
  claims: readonly NicoleProClaimV1[],
  issues: NicoleProValidationIssue[],
): void {
  const semanticClaimKeys = claims.map(claim => (
    `${claim.type}|${claim.statementId}|${claim.primaryEvidenceId}|${claim.text}`
  ));
  if (duplicateValues(semanticClaimKeys).length > 0) {
    issue(issues, 'contradictory_claims', 'claims', 'Semantically duplicate claims are not allowed.');
  }
  const polarityBySemanticKey = new Map<string, Set<string>>();
  for (const claim of claims) {
    if (claim.type === 'teacher_hypothesis' || claim.polarity === 'neutral') continue;
    const normalizedKey = claim.semanticKey.trim().toLocaleLowerCase('de-DE');
    const current = polarityBySemanticKey.get(normalizedKey) ?? new Set<string>();
    current.add(claim.polarity);
    polarityBySemanticKey.set(normalizedKey, current);
  }
  for (const [semanticKey, polarities] of polarityBySemanticKey) {
    if (polarities.has('supports') && polarities.has('opposes')) {
      issue(issues, 'contradictory_claims', 'claims', `Claims contradict each other for ${semanticKey}.`);
    }
  }
}

function validateNoUnusedPayload(
  draft: NicoleProDraftV1,
  claims: readonly NicoleProClaimV1[],
  issues: NicoleProValidationIssue[],
): void {
  const usedEvidenceIds = new Set(claims.flatMap(claim => claim.evidenceIds));
  const usedRuleIds = new Set(claims.flatMap(claim => claim.knowledgeRuleIds));
  const sectionClaimIds = new Set(Object.values(draft.sections).flat());
  for (const evidence of draft.evidence) {
    if (!usedEvidenceIds.has(evidence.evidenceId)) issue(issues, 'unknown_reference', 'evidence', `Unused evidence ${evidence.evidenceId}.`);
  }
  for (const rule of draft.knowledgeRules) {
    if (!usedRuleIds.has(rule.ruleId)) issue(issues, 'unknown_reference', 'knowledgeRules', `Unused knowledge rule ${rule.ruleId}.`);
  }
  for (const claim of claims) {
    if (!sectionClaimIds.has(claim.claimId)) issue(issues, 'incomplete_content', 'sections', `Claim ${claim.claimId} is not assigned to a section.`);
  }
}

function trustedRegistryIsValid(value: unknown): value is NicoleProTrustedKnowledgeRegistryV1 {
  if (!isObject(value) || value.schemaVersion !== 1 || !nonEmptyString(value.registryId)
    || !nonEmptyString(value.registryVersion) || !Array.isArray(value.rules) || value.rules.length === 0) return false;
  const issues: NicoleProValidationIssue[] = [];
  value.rules.forEach((rule, index) => validateKnowledgeRule(rule, index, issues));
  const ids = value.rules.filter(isObject).map(rule => String(rule.ruleId));
  return issues.length === 0 && duplicateValues(ids).length === 0;
}

function authorityPayloadIsValid(
  value: unknown,
  issues: NicoleProValidationIssue[],
): value is NicoleProValidationAuthorityV1 {
  if (!(isObject(value)
    && value.schemaVersion === 1
    && isObject(value.expectedAssessment)
    && nonEmptyString(value.expectedAssessment.analysisArtifactId)
    && nonEmptyString(value.expectedAssessment.analysisContextFingerprint)
    && positiveInteger(value.expectedAssessment.analysisContextGeneration)
    && nonEmptyString(value.expectedAssessment.sourceId)
    && EXERCISE_IDS.has(String(value.expectedAssessment.exerciseId))
    && nonEmptyString(value.expectedAssessment.policyVersion)
    && Array.isArray(value.evidence) && value.evidence.length > 0)) {
    issue(issues, 'invalid_shape', 'authority', 'A complete assessment and evidence authority is required.');
    return false;
  }
  if (!trustedRegistryIsValid(value.knowledgeRegistry)) {
    issue(issues, 'invalid_knowledge_rule', 'authority.knowledgeRegistry', 'A valid trusted knowledge registry is required.');
    return false;
  }
  if (value.knowledgeRegistry.registryId !== NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID
    || value.knowledgeRegistry.registryVersion !== NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION
    || canonicalJson(value.knowledgeRegistry) !== canonicalJson(NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1)) {
    issue(issues, 'invalid_knowledge_rule', 'authority.knowledgeRegistry', 'Knowledge authority is not the product-owned registry version.');
    return false;
  }
  const evidenceIssues: NicoleProValidationIssue[] = [];
  value.evidence.forEach((item, index) => validateEvidence(item, index, evidenceIssues));
  const evidenceIds = value.evidence.filter(isObject).map(item => String(item.evidenceId));
  issues.push(...evidenceIssues.map(item => Object.freeze({ ...item, path: `authority.${item.path}` })));
  if (duplicateValues(evidenceIds).length > 0) {
    issue(issues, 'invalid_evidence', 'authority.evidence', 'Authority evidence IDs must be unique.');
  }
  return evidenceIssues.length === 0 && duplicateValues(evidenceIds).length === 0;
}

/**
 * The only authority constructor. It binds canonical evidence to a context-
 * guarded assessment and injects the product-owned knowledge registry. The
 * private runtime digest prevents structural or post-construction forgery.
 *
 * Trust boundary: application modules and the AnalysisArtifact adapter are
 * trusted code. Untrusted planner/storage payloads never receive a minting
 * capability. This is data validation, not a sandbox for malicious JavaScript
 * already executing in the application process.
 */
export function createNicoleProValidationAuthority(input: Readonly<{
  assessment: BoundAssessmentV1<NicoleProAssessmentAuthorityValueV1>;
  currentContext: AnalysisContextEpochV1;
}>): NicoleProTrustedValidationAuthorityV1 | null {
  if (!input || typeof input !== 'object'
    || !isObject(input.currentContext) || !isObject(input.currentContext.context)
    || !isObject(input.assessment)) return null;
  const value = assessmentValueForCurrentContext(input.assessment, input.currentContext);
  if (!value
    || value.sourceId !== input.currentContext.context.sourceId
    || value.exerciseId !== input.currentContext.context.exerciseId
    || !nonEmptyString(value.analysisArtifactId)
    || !nonEmptyString(value.policyVersion)
    || !Array.isArray(value.evidence)
    || value.evidence.length === 0) return null;

  const authorityPayload: NicoleProValidationAuthorityV1 = {
    schemaVersion: 1,
    expectedAssessment: {
      analysisArtifactId: value.analysisArtifactId,
      analysisContextFingerprint: input.currentContext.fingerprint,
      analysisContextGeneration: input.currentContext.generation,
      sourceId: value.sourceId,
      exerciseId: value.exerciseId,
      policyVersion: value.policyVersion,
    },
    evidence: value.evidence,
    knowledgeRegistry: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1,
  };
  const constructionIssues: NicoleProValidationIssue[] = [];
  if (!authorityPayloadIsValid(authorityPayload, constructionIssues)
    || authorityPayload.evidence.some(evidence => (
      evidence.analysisArtifactId !== value.analysisArtifactId
      || evidence.analysisContextFingerprint !== input.currentContext.fingerprint
      || evidence.analysisContextGeneration !== input.currentContext.generation
      || evidence.sourceId !== value.sourceId
      || evidence.exerciseId !== value.exerciseId
      || evidence.policyVersion !== value.policyVersion
    ))) return null;

  const trusted = cloneAndDeepFreeze(authorityPayload) as NicoleProTrustedValidationAuthorityV1;
  trustedAuthorityDigests.set(trusted, canonicalJson(trusted));
  return trusted;
}

function trustedAuthorityIsValid(
  value: unknown,
  currentContext: AnalysisContextEpochV1 | undefined,
  issues: NicoleProValidationIssue[],
): value is NicoleProTrustedValidationAuthorityV1 {
  if (!authorityPayloadIsValid(value, issues)) return false;
  const digest = trustedAuthorityDigests.get(value);
  if (!digest || digest !== canonicalJson(value)) {
    issue(issues, 'invalid_shape', 'authority', 'Authority was not created by the context-bound product factory.');
    return false;
  }
  if (!currentContext
    || value.expectedAssessment.analysisContextFingerprint !== currentContext.fingerprint
    || value.expectedAssessment.analysisContextGeneration !== currentContext.generation
    || value.expectedAssessment.sourceId !== currentContext.context.sourceId
    || value.expectedAssessment.exerciseId !== currentContext.context.exerciseId) {
    issue(issues, 'invalid_evidence', 'authority', 'Authority is stale for the current analysis context epoch.');
    return false;
  }
  return true;
}

function validateEvidenceAuthority(
  draft: NicoleProDraftV1,
  authority: NicoleProValidationAuthorityV1,
  issues: NicoleProValidationIssue[],
): void {
  const expected = authority.expectedAssessment;
  const authorityEvidenceById = new Map(authority.evidence.map(item => [item.evidenceId, item]));
  for (const [index, evidence] of draft.evidence.entries()) {
    if (evidence.analysisArtifactId !== expected.analysisArtifactId
      || evidence.analysisContextFingerprint !== expected.analysisContextFingerprint
      || evidence.analysisContextGeneration !== expected.analysisContextGeneration
      || evidence.sourceId !== expected.sourceId
      || evidence.exerciseId !== expected.exerciseId
      || evidence.policyVersion !== expected.policyVersion
      || draft.policyVersion !== expected.policyVersion) {
      issue(issues, 'invalid_evidence', `evidence[${index}]`, 'Evidence does not belong to the expected assessment epoch and policy.');
    }
    const trusted = authorityEvidenceById.get(evidence.evidenceId);
    if (!trusted || canonicalJson(trusted) !== canonicalJson(evidence)) {
      issue(issues, 'invalid_evidence', `evidence[${index}]`, 'Evidence is not the trusted artifact projection.');
    }
  }
}

function validateClaimEvidenceCapabilities(
  claims: readonly NicoleProClaimV1[],
  evidenceById: ReadonlyMap<string, NicoleProEvidencePacketV1>,
  issues: NicoleProValidationIssue[],
): void {
  for (const claim of claims) {
    const cited = claim.evidenceIds.map(id => evidenceById.get(id)).filter(Boolean) as NicoleProEvidencePacketV1[];
    if (claim.type === 'metric_observation'
      && (cited.length === 0 || cited.some(item => !['validated', 'experimental', 'limited'].includes(item.measurementStatus)))) {
      issue(issues, 'unsupported_claim_type', `claims.${claim.claimId}`, 'Metric observation requires numeric metric evidence.');
    }
    if (cited.some(item => item.captureQuality === 'needs_correction' || item.measurementStatus === 'not_measurable')
      && !['technical_limitation'].includes(claim.type)) {
      issue(issues, 'unsupported_claim_type', `claims.${claim.claimId}`, 'Blocked/not-measurable evidence may support technical limitations only.');
    }
  }
}

export function validateNicoleProDraft(
  value: unknown,
  authority?: NicoleProTrustedValidationAuthorityV1,
  currentContext?: AnalysisContextEpochV1,
): NicoleProValidationResult {
  const issues: NicoleProValidationIssue[] = [];
  try {
    if (!isObject(value)) {
      issue(issues, 'invalid_shape', '$', 'Nicole-Pro draft must be an object.');
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }
    const draft = value as unknown as NicoleProDraftV1;
    if (!trustedAuthorityIsValid(authority, currentContext, issues)) {
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }
    if (!hasOnlyKeys(value, [
      'schemaVersion', 'draftId', 'plannerId', 'plannerVersion', 'validatorVersion',
      'policyVersion', 'generatedAt', 'reviewState', 'learnerVisible', 'parentVisible',
      'evidence', 'knowledgeRules', 'claims', 'sections',
    ])
      || draft.schemaVersion !== 1
      || !nonEmptyString(draft.draftId)
      || !nonEmptyString(draft.plannerId)
      || !nonEmptyString(draft.plannerVersion)
      || draft.validatorVersion !== NICOLE_PRO_VALIDATOR_VERSION
      || !nonEmptyString(draft.policyVersion)
      || !nonEmptyString(draft.generatedAt)
      || Number.isNaN(Date.parse(draft.generatedAt))
      || new Date(draft.generatedAt).toISOString() !== draft.generatedAt) {
      issue(issues, 'invalid_shape', '$', 'Draft identity and version metadata are incomplete.');
    }
    if (draft.reviewState !== 'pending_nicole' || draft.learnerVisible !== false || draft.parentVisible !== false) {
      issue(issues, 'external_visibility_forbidden', '$', 'Nicole-Pro drafts are internal and unpublished.');
    }
    if (!Array.isArray(draft.evidence) || draft.evidence.length === 0
      || !Array.isArray(draft.knowledgeRules) || draft.knowledgeRules.length === 0
      || !Array.isArray(draft.claims) || draft.claims.length === 0) {
      issue(issues, 'invalid_shape', '$', 'Draft requires evidence, knowledge rules and claims.');
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }
    draft.evidence.forEach((item, index) => validateEvidence(item, index, issues));
    validateEvidenceAuthority(draft, authority, issues);
    draft.knowledgeRules.forEach((item, index) => validateKnowledgeRule(item, index, issues));
    const evidenceIds = draft.evidence.map(item => isObject(item) && nonEmptyString(item.evidenceId) ? item.evidenceId : '');
    const ruleIds = draft.knowledgeRules.map(item => isObject(item) && nonEmptyString(item.ruleId) ? item.ruleId : '');
    for (const duplicate of duplicateValues(evidenceIds.filter(Boolean))) issue(issues, 'invalid_evidence', 'evidence', `Duplicate evidence id ${duplicate}.`);
    for (const duplicate of duplicateValues(ruleIds.filter(Boolean))) issue(issues, 'invalid_knowledge_rule', 'knowledgeRules', `Duplicate rule id ${duplicate}.`);
    const evidenceById = new Map(draft.evidence.filter(isObject).map(item => [String(item.evidenceId), item as unknown as NicoleProEvidencePacketV1]));
    const ruleById = new Map(draft.knowledgeRules.filter(isObject).map(item => [String(item.ruleId), item as unknown as NicoleProKnowledgeRuleV1]));
    const trustedRuleById = new Map(authority.knowledgeRegistry.rules.map(item => [item.ruleId, item]));
    draft.claims.forEach((item, index) => validateClaim(item, index, evidenceById, ruleById, trustedRuleById, issues));
    const claimIds = draft.claims.map(item => isObject(item) && nonEmptyString(item.claimId) ? item.claimId : '');
    for (const duplicate of duplicateValues(claimIds.filter(Boolean))) issue(issues, 'invalid_claim', 'claims', `Duplicate claim id ${duplicate}.`);
    const claims = draft.claims.filter(isObject) as unknown as NicoleProClaimV1[];
    const claimById = new Map(claims.map(item => [item.claimId, item]));
    validateSections(draft.sections, claimById, issues);
    validateHypothesisTests(claims, trustedRuleById, issues);
    validateClaimEvidenceCapabilities(claims, evidenceById, issues);
    validateContradictions(claims, issues);
    validateNoUnusedPayload(draft, claims, issues);
  } catch {
    issue(issues, 'invalid_shape', '$', 'Malformed Nicole-Pro data was rejected without throwing.');
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertNicoleProDraft(
  value: unknown,
  authority: NicoleProTrustedValidationAuthorityV1,
  currentContext: AnalysisContextEpochV1,
): asserts value is NicoleProDraftV1 {
  const result = validateNicoleProDraft(value, authority, currentContext);
  if (!result.valid) {
    throw new Error(`Invalid Nicole-Pro draft: ${result.issues.map(item => `${item.path}: ${item.message}`).join(' | ')}`);
  }
}
