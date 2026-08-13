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
  analysisContextFingerprint,
  createAnalysisContextEpoch,
  assessmentValueForCurrentContext,
  type AnalysisContextV1,
  type AnalysisContextEpochV1,
  type BoundAssessmentV1,
} from './analysisContextGuard';
import {
  createNicoleProExactFrameArtifactId,
  createNicoleProVersionedDraftId,
  NICOLE_PRO_ARTIFACT_KEY_SCHEME_V1,
  NICOLE_PRO_LANDMARK_MODEL_V1,
} from './nicoleProArtifactIdentity';

export const NICOLE_PRO_VALIDATOR_VERSION = 'nicole-pro-validator-v1' as const;
export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID = 'balletos-nicole-pro-knowledge' as const;
export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION = '1.2.0' as const;

interface GroundedRuleProfile {
  key: string;
  ruleId: string;
  ruleVersion: string;
  metricId: string;
  definitionVersion: string;
  side: NicoleProEvidencePacketV1['side'];
  views: readonly NicoleProEvidencePacketV1['view'][];
  subjectConceptId: string;
  finding: string;
  metric: string;
  interpretation: string;
  hypotheses: readonly Readonly<{ key: string; conceptId: string; text: string; test: string }>[];
  target: string;
  cue: string;
  practice: string;
  success: string;
  metaphor: string;
  limitation: string;
}

const PERMITTED_TEACHER_CLAIMS = Object.freeze([
  'visual_observation', 'metric_observation', 'biomechanical_interpretation',
  'teacher_hypothesis', 'differentiation_test', 'teaching_target',
  'immediate_cue', 'practice', 'success_criterion', 'metaphor', 'technical_limitation',
] as const);

function createGroundedKnowledgeRule(profile: GroundedRuleProfile): NicoleProKnowledgeRuleV1 {
  const constraint: NicoleProKnowledgeStatementV1['evidenceConstraint'] = {
    exerciseIds: ['plie'],
    phaseIds: ['paused_exact_frame'],
    sides: [profile.side],
    views: profile.views,
    metrics: [{ metricId: profile.metricId, definitionVersion: profile.definitionVersion }],
    frameAuthorities: ['exact_cache_frame'],
    measurementStatuses: ['experimental', 'limited'],
    captureQualities: ['ready', 'usable_with_caution'],
    teacherSignalStates: ['attention', 'strong_attention'],
    teacherSignalCertainties: ['supported', 'uncertain', 'weak_evidence'],
    minimumPhaseConfidence: 1,
    minimumLandmarkScore: 0.3,
    valuePredicate: { kind: 'absolute_greater_than', threshold: 0, unit: 'deg' },
  };
  const statement = (
    suffix: string,
    claimType: Exclude<NicoleProClaimType, 'clinical_claim'>,
    relation: NicoleProKnowledgeStatementV1['relation'],
    modality: NicoleProKnowledgeStatementV1['modality'],
    objectConceptId: string,
    textTemplate: string,
    relatedStatementIds: readonly string[] = [],
  ): NicoleProKnowledgeStatementV1 => ({
    statementId: `${profile.key}:${suffix}`,
    claimType,
    subjectConceptId: profile.subjectConceptId,
    relation,
    objectConceptId,
    modality,
    polarity: 'neutral',
    relatedStatementIds,
    evidenceConstraint: constraint,
    textTemplate,
  });
  const hypotheses = profile.hypotheses.map((hypothesis) => statement(
    `hypothesis:${hypothesis.key}`, 'teacher_hypothesis', 'may_be_consistent_with',
    'possible', hypothesis.conceptId, hypothesis.text,
  ));
  const tests = profile.hypotheses.map((hypothesis) => statement(
    `test:${hypothesis.key}`, 'differentiation_test', 'test_by', 'instruction',
    hypothesis.conceptId, hypothesis.test, [`${profile.key}:hypothesis:${hypothesis.key}`],
  ));
  return {
    schemaVersion: 1,
    ruleId: profile.ruleId,
    version: profile.ruleVersion,
    status: 'curated_internal',
    permittedClaimTypes: PERMITTED_TEACHER_CLAIMS,
    conceptIds: [
      profile.subjectConceptId,
      'teacher_review_action',
      ...profile.hypotheses.map(item => item.conceptId),
    ],
    sourceRefs: [`BalletOS Nicole-Pro knowledge review queue: ${profile.key}`],
    requiresNicoleCalibration: true,
    requiresExternalValidation: false,
    statements: [
      statement('finding', 'visual_observation', 'observed_as', 'direct_observation', 'teacher_review_action', profile.finding),
      statement('metric', 'metric_observation', 'observed_as', 'direct_observation', 'teacher_review_action', profile.metric),
      statement('interpretation', 'biomechanical_interpretation', 'may_influence', 'conditional', 'teacher_review_action', profile.interpretation),
      ...hypotheses,
      ...tests,
      statement('target', 'teaching_target', 'target_is', 'instruction', 'teacher_review_action', profile.target),
      statement('cue', 'immediate_cue', 'cue_with', 'instruction', 'teacher_review_action', profile.cue),
      statement('practice', 'practice', 'practice_with', 'instruction', 'teacher_review_action', profile.practice),
      statement('success', 'success_criterion', 'success_when', 'instruction', 'teacher_review_action', profile.success),
      statement('metaphor', 'metaphor', 'imagine_as', 'instruction', 'teacher_review_action', profile.metaphor),
      statement('limits', 'technical_limitation', 'limited_by', 'technical_boundary', 'teacher_review_action', profile.limitation),
    ],
  };
}

const GROUNDED_RULE_PROFILES: readonly GroundedRuleProfile[] = [
  {
    key: 'shoulder-line',
    ruleId: 'knowledge:shoulder-line:teacher-v1',
    ruleVersion: '1.0.0',
    metricId: 'shoulder_horizontal',
    definitionVersion: 'shoulder-horizontal-image-v1',
    side: 'bilateral',
    views: ['frontal'],
    subjectConceptId: 'shoulder_line_continuity',
    finding: 'Im {phaseLabel} ist die projizierte Schulterlinie gegenüber der Bildhorizontalen sichtbar geneigt.',
    metric: 'Die projizierte Schulterlinie weicht in diesem Bild um {value} von der Bildhorizontalen ab.',
    interpretation: 'Falls Nicole in dieser Phase eine ruhig organisierte Schulterlinie erwartet, kann die sichtbare Neigung die Verbindung von Schultergürtel, Rumpf und Armführung unterbrechen.',
    hypotheses: [
      { key: 'arm-timing', conceptId: 'shoulder_arm_timing', text: 'Das Muster kann mit dem Timing von Schultergürtel und Armführung vereinbar sein.', test: 'Nicole wiederholt die Passage langsamer und lässt den Ellbogen führen, während der Schultergürtel breit und ruhig bleibt; stabilisiert sich die Linie, prüft sie eine Koordinationsaufgabe zwischen Armführung und Schultergürtel.' },
      { key: 'epaulement', conceptId: 'intentional_epaulement', text: 'Ein beabsichtigtes Épaulement oder eine Körperrotation kann die sichtbare Schulterlinie verändern.', test: 'Nicole vergleicht denselben Moment frontal und leicht seitlich; bleibt die Linie nur in einer Ansicht geneigt, prüft sie zuerst Perspektive und beabsichtigtes Épaulement.' },
      { key: 'weight-transfer', conceptId: 'upper_body_weight_transfer', text: 'Eine Gewichtsverlagerung über Becken und Rumpf kann sich bis in die Schulterlinie fortsetzen.', test: 'Nicole lässt die Bewegung mit kleinerer Tiefe wiederholen und beobachtet Becken-, Rumpf- und Schulterlinie gemeinsam; stabilisieren sie sich zusammen, wird die ganze Kette weiter geprüft.' },
    ],
    target: 'Ziel ist eine zur Phase passende, ruhig getragene Schulterlinie, die das Épaulement unterstützt statt zufällig zu kippen.',
    cue: 'Schlüsselbeine breit – der Ellbogen führt, die Schulter folgt ruhig.',
    practice: 'Die Passage langsam bis zum markierten Frame wiederholen, nur eine Hypothese verändern und die Schulterlinie im direkten Vorher-nachher-Vergleich prüfen.',
    success: 'Erfolg ist sichtbar, wenn die Schulterlinie bei gleicher Phase und Ansicht wiederholbar ruhiger wird, ohne die beabsichtigte Armform zu verlieren.',
    metaphor: 'Die Schlüsselbeine tragen ein breites Tablett: offen und ruhig, während die Arme frei darum herum tanzen.',
    limitation: 'Die frontale Bildprojektion trennt beabsichtigtes Épaulement, Körperrotation und Kameraperspektive nicht sicher; sie bestimmt keine Muskel- oder Gelenkursache.',
  },
  {
    key: 'spine-aplomb',
    ruleId: 'knowledge:spine-aplomb:teacher-v1',
    ruleVersion: '1.1.0',
    metricId: 'spine_tilt_aplomb',
    definitionVersion: 'spine-center-image-vertical-v1',
    side: 'center',
    views: ['frontal', 'profile_left', 'profile_right'],
    subjectConceptId: 'projected_spine_aplomb',
    finding: 'Im {phaseLabel} ist die projizierte Rumpfachse gegenüber der Bildvertikalen sichtbar geneigt.',
    metric: 'Die projizierte Rumpfachse weicht in diesem Bild um {value} von der Bildvertikalen ab.',
    interpretation: 'Falls Nicole in dieser Phase Aplomb erwartet, kann die sichtbare Neigung die Stapelung von Becken, Rumpf und Schultergürtel verändern.',
    hypotheses: [
      { key: 'intentional-line', conceptId: 'intentional_torso_inclination', text: 'Die Neigung kann zur gewählten Phase oder zu einem beabsichtigten Épaulement gehören.', test: 'Nicole markiert den Bewegungsmoment und prüft, ob dieselbe Rumpflinie bei korrekter Aufgabe ausdrücklich gewünscht ist.' },
      { key: 'weight-transfer', conceptId: 'torso_weight_transfer_timing', text: 'Das Muster kann mit dem Timing der Gewichtsverlagerung vereinbar sein.', test: 'Nicole lässt die Passage kleiner und langsamer wiederholen; richtet sich die Rumpfachse bei gleicher Fußaufgabe früher auf, prüft sie das Timing der Gewichtsübernahme.' },
      { key: 'camera-view', conceptId: 'torso_camera_projection', text: 'Eine schräge Kamera oder Körperrotation kann eine scheinbare Rumpfneigung erzeugen.', test: 'Nicole kontrolliert Kamerahorizont und Frontansicht und vergleicht einen zweiten Versuch aus identischer Position.' },
    ],
    target: 'Ziel ist eine zur Phase passende Rumpfachse, bei der Schultermitte und Beckenmitte kontrolliert miteinander organisiert bleiben.',
    cue: 'Scheitel lang, Brustbein über der Beckenmitte – getragen, nicht starr.',
    practice: 'Die Passage in kleinerem Bewegungsumfang wiederholen, am markierten Moment kurz halten und Rumpfachse sowie Gewichtsverlagerung gemeinsam vergleichen.',
    success: 'Erfolg ist sichtbar, wenn die Rumpfachse bei gleicher Phase und Ansicht wiederholbar näher an Nicoles gewünschter Linie bleibt.',
    metaphor: 'Ein goldener Faden führt durch die Körperblöcke: lang gestapelt wie ruhige Bausteine, ohne festzufrieren.',
    limitation: 'Die Bildlinie ist eine zweidimensionale Projektion und keine dreidimensionale Wirbelsäulenmessung; Ursache, Kraft und Gewebebelastung sind daraus nicht bestimmbar.',
  },
  {
    key: 'pelvis-line',
    ruleId: 'knowledge:pelvis-line:teacher-v1',
    ruleVersion: '1.0.0',
    metricId: 'projected_hip_line_obliquity',
    definitionVersion: 'pelvis-line-image-v1',
    side: 'bilateral',
    views: ['frontal'],
    subjectConceptId: 'projected_pelvis_line',
    finding: 'Im {phaseLabel} ist die projizierte Beckenlinie zwischen den sichtbaren Hüftpunkten gegenüber der Bildhorizontalen geneigt.',
    metric: 'Die projizierte Beckenlinie weicht in diesem Bild um {value} von der Bildhorizontalen ab.',
    interpretation: 'Falls Nicole in dieser Phase ein ruhig organisiertes Becken erwartet, kann die sichtbare Neigung die darüber aufgebauten Rumpf- und Beinlinien verändern.',
    hypotheses: [
      { key: 'weight-shift', conceptId: 'pelvis_weight_shift', text: 'Das Muster kann mit einer seitlichen Gewichtsverlagerung vereinbar sein.', test: 'Nicole lässt die Passage mit kleinerer Tiefe wiederholen und prüft, ob stützende Basis und Beckenlinie gleichzeitig ruhiger werden.' },
      { key: 'torso-compensation', conceptId: 'pelvis_torso_coordination', text: 'Eine Veränderung der Rumpforganisation kann sich gemeinsam mit der sichtbaren Beckenlinie zeigen.', test: 'Nicole gibt nur einen Rumpf-Cue und beobachtet, ob sich Becken- und Rumpfachse gemeinsam verändern; erst dann entscheidet sie über die nächste Korrektur.' },
      { key: 'camera-view', conceptId: 'pelvis_camera_projection', text: 'Körperrotation, Bewegungstiefe oder Kameraperspektive können die projizierte Beckenlinie verändern.', test: 'Nicole prüft Frontansicht, Bewegungstiefe und einen zweiten Versuch aus identischer Kameraposition, bevor sie die Linie fachlich bewertet.' },
    ],
    target: 'Ziel ist eine zur Aufgabe passende Beckenorganisation, die stützende Basis, beide Beine und Rumpf klar miteinander verbindet.',
    cue: 'Trag die Beckenschale ruhig über der stützenden Basis – beweglich, aber nicht auslaufend.',
    practice: 'Die Passage langsam und kleiner wiederholen, sichtbare Fußorganisation und Beckenlinie am markierten Frame gemeinsam prüfen und nur eine Variable verändern.',
    success: 'Erfolg ist sichtbar, wenn die Beckenlinie bei gleicher Phase und Ansicht wiederholbar ruhiger wird und der Bewegungsweg kontrolliert bleibt.',
    metaphor: 'Das Becken ist eine gefüllte Schale: Du trägst sie ruhig durch die Bewegung, ohne sie starr festzuhalten.',
    limitation: 'Die Verbindung sichtbarer Hüftpunkte ist keine anatomische dreidimensionale Beckenmessung; Perspektive, Rotation und Bewegungsphase müssen von Nicole geprüft werden.',
  },
];

export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1: NicoleProTrustedKnowledgeRegistryV1 = cloneAndDeepFreeze({
  schemaVersion: 1,
  registryId: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
  registryVersion: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
  rules: GROUNDED_RULE_PROFILES.map(createGroundedKnowledgeRule),
});

/**
 * Product-owned immutable registry archive. Existing entries must never be
 * rewritten or removed when a newer knowledge version is introduced because
 * reviewed Nicole-Pro origins retain the exact version that created them.
 */
export const NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE: readonly NicoleProTrustedKnowledgeRegistryV1[] = cloneAndDeepFreeze([
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1,
]);

const NICOLE_PRO_REGISTRY_RUNTIME_ARCHIVE = cloneAndDeepFreeze([{
  registryId: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
  registryVersion: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
  validatorVersions: [NICOLE_PRO_VALIDATOR_VERSION],
  planners: [{ id: 'balletos-nicole-pro-deterministic-planner', version: '1.0.0' }],
  artifactKeyScheme: NICOLE_PRO_ARTIFACT_KEY_SCHEME_V1,
  landmarkModels: [NICOLE_PRO_LANDMARK_MODEL_V1],
}]);

export function resolveNicoleProTrustedKnowledgeRegistry(
  registryId: string,
  registryVersion: string,
): NicoleProTrustedKnowledgeRegistryV1 | null {
  return NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE.find(registry => (
    registry.registryId === registryId && registry.registryVersion === registryVersion
  )) ?? null;
}

function registryRuntimeIsCompatible(
  registryId: string,
  registryVersion: string,
  plannerId: string,
  plannerVersion: string,
  validatorVersion: string,
): boolean {
  const entry = NICOLE_PRO_REGISTRY_RUNTIME_ARCHIVE.find(item => (
    item.registryId === registryId && item.registryVersion === registryVersion
  ));
  return Boolean(entry
    && entry.validatorVersions.includes(validatorVersion as typeof NICOLE_PRO_VALIDATOR_VERSION)
    && entry.planners.some(planner => planner.id === plannerId && planner.version === plannerVersion));
}

function registryRuntimeFor(
  registryId: string,
  registryVersion: string,
) {
  return NICOLE_PRO_REGISTRY_RUNTIME_ARCHIVE.find(item => (
    item.registryId === registryId && item.registryVersion === registryVersion
  )) ?? null;
}

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
    'videoWidth', 'videoHeight', 'metricId', 'definitionVersion', 'measurementStatus', 'metricInputConfidence',
    'value', 'unit', 'uncertainty', 'captureQuality', 'teacherSignal', 'landmarkQuality',
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
    if (!finiteUnitInterval(evidence.metricInputConfidence) || evidence.metricInputConfidence <= 0) {
      issue(issues, 'invalid_evidence', `${path}.metricInputConfidence`, 'Numeric metric evidence requires its own finite input confidence.');
    }
  } else if (evidence.metricInputConfidence !== null) {
    issue(issues, 'invalid_evidence', `${path}.metricInputConfidence`, 'Qualitative/not-measurable evidence must not carry metric input confidence.');
  }
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
  if (!isObject(evidence.teacherSignal)
    || !hasOnlyKeys(evidence.teacherSignal, ['state', 'certainty'])
    || !['match', 'attention', 'strong_attention'].includes(String(evidence.teacherSignal.state))
    || !['supported', 'uncertain', 'weak_evidence'].includes(String(evidence.teacherSignal.certainty))) {
    issue(issues, 'invalid_evidence', `${path}.teacherSignal`, 'Teacher signal must remain separate and explicit.');
  } else if (numericMeasurement
    && typeof evidence.metricInputConfidence === 'number'
    && evidence.metricInputConfidence < 0.35
    && evidence.teacherSignal.certainty === 'supported') {
    issue(issues, 'invalid_evidence', `${path}.teacherSignal`, 'Low metric input confidence cannot claim supported teacher evidence.');
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
      'teacherSignalStates', 'teacherSignalCertainties', 'minimumLandmarkScore', 'valuePredicate',
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
    || !Array.isArray(evidenceConstraint.teacherSignalStates) || evidenceConstraint.teacherSignalStates.length === 0
    || evidenceConstraint.teacherSignalStates.some(item => !['match', 'attention', 'strong_attention'].includes(String(item)))
    || !Array.isArray(evidenceConstraint.teacherSignalCertainties) || evidenceConstraint.teacherSignalCertainties.length === 0
    || evidenceConstraint.teacherSignalCertainties.some(item => !['supported', 'uncertain', 'weak_evidence'].includes(String(item)))
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

const DISPLAY_DECIMALS_BY_DEFINITION = new Map<string, number>([
  ['shoulder_horizontal:shoulder-horizontal-image-v1:deg', 1],
  ['spine_tilt_aplomb:spine-center-image-vertical-v1:deg', 1],
  ['projected_hip_line_obliquity:pelvis-line-image-v1:deg', 1],
]);

/** Definition-bound display precision. Raw experimental values never leak as pseudo-precision. */
export function formatNicoleProEvidenceValue(evidence: NicoleProEvidencePacketV1): string | null {
  if (typeof evidence.value !== 'number') return null;
  const decimals = DISPLAY_DECIMALS_BY_DEFINITION.get(
    `${evidence.metricId}:${evidence.definitionVersion}:${evidence.unit}`,
  );
  if (decimals === undefined) return null;
  const normalized = evidence.value.toFixed(decimals).replace('.', ',');
  if (evidence.unit === 'deg') return `${normalized}°`;
  if (evidence.unit === 'percent') return `${normalized}%`;
  return normalized;
}

function renderStatement(statement: NicoleProKnowledgeStatementV1, evidence: NicoleProEvidencePacketV1): string | null {
  const value = formatNicoleProEvidenceValue(evidence);
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
    && constraint.teacherSignalStates.includes(evidence.teacherSignal.state)
    && constraint.teacherSignalCertainties.includes(evidence.teacherSignal.certainty)
    && evidence.phaseConfidence >= constraint.minimumPhaseConfidence
    && evidence.landmarkQuality.status === 'measured'
    && typeof evidence.landmarkQuality.score === 'number'
    && evidence.landmarkQuality.score >= constraint.minimumLandmarkScore
    && typeof evidence.value === 'number'
    && evidence.unit === constraint.valuePredicate.unit
    && Math.abs(evidence.value) > constraint.valuePredicate.threshold;
}

export function projectNicoleProStatementText(
  statement: NicoleProKnowledgeStatementV1,
  evidence: NicoleProEvidencePacketV1,
): string | null {
  return renderStatement(statement, evidence);
}

export function nicoleProStatementMatchesEvidence(
  statement: NicoleProKnowledgeStatementV1,
  evidence: NicoleProEvidencePacketV1,
): boolean {
  return evidenceMatchesStatement(evidence, statement);
}

export function nicoleProStatementSemanticKey(statement: NicoleProKnowledgeStatementV1): string {
  return `${statement.subjectConceptId}:${statement.relation}:${statement.objectConceptId}`;
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
    const expectedDisplayToken = evidence ? formatNicoleProEvidenceValue(evidence) : null;
    if (!evidence
      || reference.evidenceId !== claim.primaryEvidenceId
      || !claim.evidenceIds.includes(reference.evidenceId)
      || evidence.metricId !== reference.metricId
      || evidence.definitionVersion !== reference.definitionVersion
      || typeof evidence.value !== 'number'
      || numberValue === null
      || expectedDisplayToken === null
      || reference.token !== expectedDisplayToken
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
  const archivedRegistry = resolveNicoleProTrustedKnowledgeRegistry(
    value.knowledgeRegistry.registryId,
    value.knowledgeRegistry.registryVersion,
  );
  if (!archivedRegistry || canonicalJson(value.knowledgeRegistry) !== canonicalJson(archivedRegistry)) {
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
  knowledgeRegistry?: NicoleProTrustedKnowledgeRegistryV1;
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

  const requestedRegistry = input.knowledgeRegistry ?? NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1;
  const archivedRegistry = resolveNicoleProTrustedKnowledgeRegistry(
    requestedRegistry.registryId,
    requestedRegistry.registryVersion,
  );
  if (!archivedRegistry || canonicalJson(requestedRegistry) !== canonicalJson(archivedRegistry)) return null;
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
    knowledgeRegistry: archivedRegistry,
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

function contextEpochFromStoredEvidence(evidence: NicoleProEvidencePacketV1): AnalysisContextEpochV1 | null {
  try {
    const parsed = JSON.parse(evidence.analysisContextFingerprint) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 5 || parsed[0] !== 1
      || parsed[1] !== evidence.sourceId || parsed[3] !== evidence.exerciseId
      || typeof parsed[2] !== 'string'
      || !['minis', 'kids', 'teens', 'adults', 'masterclass'].includes(String(parsed[4]))) return null;
    const context: AnalysisContextV1 = Object.freeze({
      schemaVersion: 1,
      sourceId: parsed[1],
      studentId: parsed[2],
      exerciseId: parsed[3],
      levelId: parsed[4] as AnalysisContextV1['levelId'],
    });
    if (analysisContextFingerprint(context) !== evidence.analysisContextFingerprint) return null;
    return createAnalysisContextEpoch(context, evidence.analysisContextGeneration);
  } catch {
    return null;
  }
}

/** Full semantic reload validation against the immutable product registry archive. */
export function validateStoredNicoleProDraft(
  value: unknown,
  registryId: string,
  registryVersion: string,
): NicoleProValidationResult {
  const invalid = (message: string): NicoleProValidationResult => Object.freeze({
    valid: false,
    issues: Object.freeze([Object.freeze({ code: 'invalid_shape' as const, path: '$', message })]),
  });
  if (!value || typeof value !== 'object') return invalid('Stored Nicole-Pro draft is malformed.');
  const draft = value as NicoleProDraftV1;
  if (!Array.isArray(draft.evidence) || draft.evidence.length !== 1) {
    return invalid('Stored Nicole-Pro draft requires one exact evidence packet.');
  }
  const evidence = draft.evidence[0];
  const context = contextEpochFromStoredEvidence(evidence);
  const registry = resolveNicoleProTrustedKnowledgeRegistry(registryId, registryVersion);
  const runtime = registryRuntimeFor(registryId, registryVersion);
  const plannerRuntime = runtime?.planners.find(planner => (
    planner.id === draft.plannerId && planner.version === draft.plannerVersion
  ));
  const landmarkModel = runtime?.landmarkModels.find(model => (
    model.modelId === evidence.landmarkQuality.modelId
    && model.modelVersion === evidence.landmarkQuality.modelVersion
  ));
  if (!context || !registry || !runtime || !plannerRuntime
    || runtime.artifactKeyScheme !== NICOLE_PRO_ARTIFACT_KEY_SCHEME_V1
    || !landmarkModel
    || evidence.analysisArtifactId !== createNicoleProExactFrameArtifactId(
      context, evidence.mediaTimeUs, landmarkModel,
    )
    || draft.draftId !== createNicoleProVersionedDraftId({
      context,
      mediaTimeUs: evidence.mediaTimeUs,
      landmarkModel,
      metricId: evidence.metricId,
      policyVersion: evidence.policyVersion,
      registryId,
      registryVersion,
      plannerId: plannerRuntime.id,
      plannerVersion: plannerRuntime.version,
      validatorVersion: draft.validatorVersion,
    })) return invalid('Stored Nicole-Pro context, model, artifact, draft or registry version is unavailable.');
  const authority = createNicoleProValidationAuthority({
    currentContext: context,
    knowledgeRegistry: registry,
    assessment: {
      schemaVersion: 1,
      contextFingerprint: context.fingerprint,
      contextGeneration: context.generation,
      value: {
        analysisArtifactId: evidence.analysisArtifactId,
        sourceId: evidence.sourceId,
        exerciseId: evidence.exerciseId,
        policyVersion: evidence.policyVersion,
        evidence: draft.evidence,
      },
    },
  });
  return authority
    ? validateNicoleProDraft(draft, authority, context)
    : invalid('Stored Nicole-Pro authority could not be reconstructed.');
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
      || !registryRuntimeIsCompatible(
        authority.knowledgeRegistry.registryId,
        authority.knowledgeRegistry.registryVersion,
        draft.plannerId,
        draft.plannerVersion,
        draft.validatorVersion,
      )
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
