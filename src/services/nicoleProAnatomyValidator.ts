import type { AnalysisContextEpochV1 } from './analysisContextGuard';
import { MOTION_REGISTRY } from './motionRegistry';
import {
  type NicoleProTrustedValidationAuthorityV1,
  validateNicoleProDraft,
} from './nicoleProContentValidator';
import type { NicoleProClaimV1, NicoleProDraftV1 } from '../types/nicoleProContent';
import {
  NICOLE_PRO_ANATOMY_SCHEMA_VERSION,
  type NicoleAnatomyClaimAnnotationV1,
  type NicoleAnatomyDifferentiationAnnotationV1,
  type NicoleAnatomyHypothesisAnnotationV1,
  type NicoleAnatomyKnowledgeItemV1,
  type NicoleAnatomyKnowledgeRegistryV1,
  type NicoleAnatomyProBundleV1,
  type NicoleAnatomyScientificValidation,
  type NicoleAnatomyValidationIssueCode,
  type NicoleAnatomyValidationIssueV1,
  type NicoleAnatomyValidationResultV1,
} from '../types/nicoleProAnatomy';

export const NICOLE_PRO_ANATOMY_VALIDATOR_VERSION = 'nicole-pro-anatomy-validator-v1' as const;
export const NICOLE_PRO_ANATOMY_REGISTRY_ID = 'balletos-nicole-anatomy-pro' as const;
export const NICOLE_PRO_ANATOMY_REGISTRY_VERSION = '1.0.0' as const;

type PlainObject = Record<string, unknown>;

function isObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cloneAndDeepFreeze<T>(value: T): T {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    for (const child of Object.values(item as PlainObject)) freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}

function hasOnlyKeys(value: PlainObject, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

function isIsoInstant(value: unknown): value is string {
  return nonEmptyString(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function uniqueStrings(value: unknown, allowEmpty = false): value is readonly string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(nonEmptyString)
    && new Set(value).size === value.length;
}

function issue(
  issues: NicoleAnatomyValidationIssueV1[],
  code: NicoleAnatomyValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ code, path, message }));
}

const POLICY_SOURCE = Object.freeze({
  sourceId: 'balletos:epistemic-boundary:single-view-causality-v1',
  title: 'BalletOS Nicole-Pro epistemic boundary',
  locator: 'Product policy: single-view 2D movement evidence',
  evidenceKind: 'product_policy' as const,
  population: 'all BalletOS teacher-review contexts',
  scope: 'A visible single-view 2D movement pattern does not establish an individual anatomical cause.',
  versionOrDate: '1.0.0',
  limitations: 'Internal product boundary; not a clinical validation or a medical source.',
});

const EPISTEMIC_BOUNDARY_ITEM = Object.freeze({
  schemaVersion: NICOLE_PRO_ANATOMY_SCHEMA_VERSION,
  itemId: 'anatomy:boundary:single-view-does-not-establish-cause',
  version: '1.0.0',
  reviewState: 'ai_draft' as const,
  scientificValidation: 'curated_internal' as const,
  sourceRefs: [POLICY_SOURCE],
  applicability: {
    exerciseIds: MOTION_REGISTRY.map(item => item.id),
    phaseIds: ['*'],
    sides: ['left', 'right', 'bilateral', 'center', 'not_applicable'] as const,
    views: ['frontal', 'profile_left', 'profile_right', 'oblique', 'undetermined'] as const,
    ageScopes: ['unspecified'] as const,
  },
  internalOnly: true as const,
  outwardEligibility: false as const,
  kind: 'anatomy_fact' as const,
  epistemicKind: 'general_knowledge' as const,
  subjectConceptId: 'single_view_2d_movement_pattern',
  relation: 'does_not_establish' as const,
  objectConceptId: 'individual_anatomical_cause',
  statement: 'A visible single-view 2D movement pattern does not establish an individual anatomical cause.',
});

const PROFILE_VIEW_BOUNDARY_ITEM = Object.freeze({
  ...EPISTEMIC_BOUNDARY_ITEM,
  itemId: 'anatomy:boundary:profile-view-does-not-establish-cause',
  subjectConceptId: 'profile_view_2d_movement_pattern',
  applicability: {
    ...EPISTEMIC_BOUNDARY_ITEM.applicability,
    views: ['profile_left'] as const,
  },
  statement: 'A profile-view 2D movement pattern does not establish an individual anatomical cause.',
});

export const NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1: NicoleAnatomyKnowledgeRegistryV1 = cloneAndDeepFreeze({
  schemaVersion: NICOLE_PRO_ANATOMY_SCHEMA_VERSION,
  registryId: NICOLE_PRO_ANATOMY_REGISTRY_ID,
  registryVersion: NICOLE_PRO_ANATOMY_REGISTRY_VERSION,
  sources: [POLICY_SOURCE],
  items: [EPISTEMIC_BOUNDARY_ITEM, PROFILE_VIEW_BOUNDARY_ITEM],
});

export const NICOLE_PRO_ANATOMY_REGISTRY_ARCHIVE: readonly NicoleAnatomyKnowledgeRegistryV1[] = cloneAndDeepFreeze([
  NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1,
]);

export function resolveNicoleProAnatomyRegistry(
  registryId: string,
  registryVersion: string,
): NicoleAnatomyKnowledgeRegistryV1 | null {
  return NICOLE_PRO_ANATOMY_REGISTRY_ARCHIVE.find(item => (
    item.registryId === registryId && item.registryVersion === registryVersion
  )) ?? null;
}

interface NicoleAnatomyAuthorityPayloadV1 {
  schemaVersion: typeof NICOLE_PRO_ANATOMY_SCHEMA_VERSION;
  expectedContext: NicoleAnatomyProBundleV1['context'];
  nicoleProDraft: NicoleProDraftV1;
  knowledgeRegistry: NicoleAnatomyKnowledgeRegistryV1;
}

declare const trustedAnatomyAuthorityBrand: unique symbol;
export type NicoleAnatomyTrustedValidationAuthorityV1 = NicoleAnatomyAuthorityPayloadV1 & Readonly<{
  [trustedAnatomyAuthorityBrand]: true;
}>;

const trustedAuthorityDigests = new WeakMap<object, string>();

/**
 * Adapts the already context-bound Nicole-Pro trust root. Untrusted data or an
 * LLM cannot mint this authority from a structural clone.
 */
export function createNicoleAnatomyValidationAuthority(input: Readonly<{
  draft: NicoleProDraftV1;
  nicoleProAuthority: NicoleProTrustedValidationAuthorityV1;
  currentContext: AnalysisContextEpochV1;
  phaseId: string;
  side: NicoleAnatomyProBundleV1['context']['side'];
  view: NicoleAnatomyProBundleV1['context']['view'];
  knowledgeRegistry?: NicoleAnatomyKnowledgeRegistryV1;
}>): NicoleAnatomyTrustedValidationAuthorityV1 | null {
  try {
    if (!validateNicoleProDraft(input.draft, input.nicoleProAuthority, input.currentContext).valid
      || !nonEmptyString(input.phaseId)) return null;
    const evidence = input.draft.evidence.find(item => (
      item.phaseId === input.phaseId && item.side === input.side && item.view === input.view
    ));
    if (!evidence) return null;
    const requestedRegistry = input.knowledgeRegistry ?? NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1;
    const archived = resolveNicoleProAnatomyRegistry(requestedRegistry.registryId, requestedRegistry.registryVersion);
    if (!archived || canonicalJson(requestedRegistry) !== canonicalJson(archived)) return null;
    const payload: NicoleAnatomyAuthorityPayloadV1 = {
      schemaVersion: 1,
      expectedContext: {
        analysisArtifactId: evidence.analysisArtifactId,
        analysisContextFingerprint: evidence.analysisContextFingerprint,
        analysisContextGeneration: evidence.analysisContextGeneration,
        sourceId: evidence.sourceId,
        exerciseId: evidence.exerciseId,
        phaseId: evidence.phaseId,
        side: evidence.side,
        view: evidence.view,
        policyVersion: evidence.policyVersion,
      },
      nicoleProDraft: input.draft,
      knowledgeRegistry: archived,
    };
    const trusted = cloneAndDeepFreeze(payload) as NicoleAnatomyTrustedValidationAuthorityV1;
    trustedAuthorityDigests.set(trusted, canonicalJson(trusted));
    return trusted;
  } catch {
    return null;
  }
}

function authorityIsCurrent(
  authority: NicoleAnatomyTrustedValidationAuthorityV1 | undefined,
  currentContext: AnalysisContextEpochV1 | undefined,
): authority is NicoleAnatomyTrustedValidationAuthorityV1 {
  if (!authority || !currentContext) return false;
  const digest = trustedAuthorityDigests.get(authority);
  return Boolean(digest && digest === canonicalJson(authority)
    && authority.expectedContext.analysisContextFingerprint === currentContext.fingerprint
    && authority.expectedContext.analysisContextGeneration === currentContext.generation
    && authority.expectedContext.sourceId === currentContext.context.sourceId
    && authority.expectedContext.exerciseId === currentContext.context.exerciseId);
}

const REVIEW_STATES = new Set(['ai_draft', 'nicole_accepted', 'nicole_revised', 'rejected']);
const SCIENTIFIC_STATES = new Set<NicoleAnatomyScientificValidation>([
  'curated_internal', 'source_supported', 'externally_validated_for_stated_scope',
]);
const HYPOTHESIS_DOMAINS = new Set(['anatomical', 'coordination', 'technical', 'capture_artifact']);
const HYPOTHESIS_ROLES = new Set(['working', 'alternative', 'artifact']);
const ALLOWED_PERFORMERS = new Set(['nicole', 'qualified_teacher', 'health_professional']);
const TEST_SAFETY_CLASSES = new Set(['observation_only', 'low_load_teacher_task', 'clinical_only']);
type HypothesisClassification = Readonly<Pick<
  NicoleAnatomyHypothesisAnnotationV1,
  'hypothesisDomain' | 'hypothesisRole' | 'epistemicKind'
>>;

/** Product-owned classification of the current deterministic Nicole-Pro hypothesis statements. */
const SOURCE_CLAIM_CLASSIFICATION_BY_CONCEPT: Readonly<Record<string, HypothesisClassification>> = cloneAndDeepFreeze({
  shoulder_arm_timing: { hypothesisDomain: 'coordination', hypothesisRole: 'working', epistemicKind: 'working_hypothesis' },
  intentional_epaulement: { hypothesisDomain: 'technical', hypothesisRole: 'alternative', epistemicKind: 'counter_hypothesis' },
  upper_body_weight_transfer: { hypothesisDomain: 'coordination', hypothesisRole: 'alternative', epistemicKind: 'counter_hypothesis' },
  torso_weight_transfer_timing: { hypothesisDomain: 'coordination', hypothesisRole: 'working', epistemicKind: 'working_hypothesis' },
  intentional_torso_inclination: { hypothesisDomain: 'technical', hypothesisRole: 'alternative', epistemicKind: 'counter_hypothesis' },
  torso_camera_projection: { hypothesisDomain: 'capture_artifact', hypothesisRole: 'artifact', epistemicKind: 'counter_hypothesis' },
  pelvis_weight_shift: { hypothesisDomain: 'coordination', hypothesisRole: 'working', epistemicKind: 'working_hypothesis' },
  pelvis_torso_coordination: { hypothesisDomain: 'coordination', hypothesisRole: 'alternative', epistemicKind: 'counter_hypothesis' },
  pelvis_camera_projection: { hypothesisDomain: 'capture_artifact', hypothesisRole: 'artifact', epistemicKind: 'counter_hypothesis' },
});
const CONTRAINDICATION_CODES = new Set(['pain_reported', 'acute_injury_reported', 'not_cleared']);

function reviewStateValid(value: unknown): boolean {
  return typeof value === 'string' && REVIEW_STATES.has(value);
}

function statementStatusFromKnowledge(
  ids: readonly string[],
  knowledgeById: ReadonlyMap<string, NicoleAnatomyKnowledgeItemV1>,
): NicoleAnatomyScientificValidation | null {
  const ranks: Record<NicoleAnatomyScientificValidation, number> = {
    curated_internal: 0,
    source_supported: 1,
    externally_validated_for_stated_scope: 2,
  };
  const items = ids.map(id => knowledgeById.get(id));
  if (items.some(item => !item) || items.length === 0) return null;
  return items.reduce((lowest, item) => (
    item && ranks[item.scientificValidation] < ranks[lowest] ? item.scientificValidation : lowest
  ), items[0]!.scientificValidation);
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const lookup = new Set(left);
  return right.some(item => lookup.has(item));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(item => right.includes(item));
}

function validateClaimBindings(
  bundle: NicoleAnatomyProBundleV1,
  claimById: ReadonlyMap<string, NicoleProClaimV1>,
  evidenceIds: ReadonlySet<string>,
  issues: NicoleAnatomyValidationIssueV1[],
): Map<string, NicoleAnatomyProBundleV1['claimBindings'][number]> {
  const bindingById = new Map<string, NicoleAnatomyProBundleV1['claimBindings'][number]>();
  bundle.claimBindings.forEach((binding, index) => {
    const path = `claimBindings[${index}]`;
    if (!isObject(binding) || !hasOnlyKeys(binding, [
      'bindingId', 'claimId', 'evidenceIds', 'epistemicKind', 'reviewState', 'internalOnly', 'outwardEligibility',
    ]) || !nonEmptyString(binding.bindingId) || !nonEmptyString(binding.claimId)
      || !uniqueStrings(binding.evidenceIds) || !reviewStateValid(binding.reviewState)
      || binding.internalOnly !== true || binding.outwardEligibility !== false) {
      issue(issues, 'invalid_shape', path, 'Claim binding is malformed or externally eligible.');
      return;
    }
    if (bindingById.has(binding.bindingId)) issue(issues, 'invalid_shape', `${path}.bindingId`, 'Binding ID must be unique.');
    const claim = claimById.get(binding.claimId);
    const expectedKind = claim?.type === 'metric_observation' ? 'measurement'
      : claim?.type === 'visual_observation' ? 'visible_observation' : null;
    if (!claim || !expectedKind || binding.epistemicKind !== expectedKind
      || !sameStringSet(binding.evidenceIds, claim.evidenceIds)
      || binding.evidenceIds.some(id => !evidenceIds.has(id))) {
      issue(issues, 'unknown_reference', path, 'Binding must reference the exact current measurement or visual-observation claim evidence.');
    }
    if (bundle.origin === 'ai_suggestion' && binding.reviewState !== 'ai_draft') {
      issue(issues, 'invalid_review_state', `${path}.reviewState`, 'AI output cannot self-assert Nicole review.');
    }
    bindingById.set(binding.bindingId, binding);
  });
  return bindingById;
}

function validateKnowledgeItems(
  bundle: NicoleAnatomyProBundleV1,
  registry: NicoleAnatomyKnowledgeRegistryV1,
  expectedContext: NicoleAnatomyProBundleV1['context'],
  issues: NicoleAnatomyValidationIssueV1[],
): Map<string, NicoleAnatomyKnowledgeItemV1> {
  const trustedById = new Map(registry.items.map(item => [item.itemId, item]));
  const result = new Map<string, NicoleAnatomyKnowledgeItemV1>();
  bundle.knowledgeItems.forEach((item, index) => {
    const path = `knowledgeItems[${index}]`;
    const trusted = isObject(item) && nonEmptyString(item.itemId) ? trustedById.get(item.itemId) : null;
    if (!trusted || canonicalJson(item) !== canonicalJson(trusted)) {
      issue(issues, 'unknown_reference', path, 'General knowledge must be an exact item from the product-owned registry.');
      return;
    }
    const applicability = trusted.applicability;
    const phaseMatches = applicability.phaseIds.includes('*')
      || applicability.phaseIds.includes(expectedContext.phaseId);
    if (!applicability.exerciseIds.includes(expectedContext.exerciseId)
      || !phaseMatches
      || !applicability.sides.includes(expectedContext.side)
      || !applicability.views.includes(expectedContext.view)
      || applicability.ageScopes.length !== 1
      || applicability.ageScopes[0] !== 'unspecified') {
      issue(issues, 'unknown_reference', `${path}.applicability`, 'Knowledge applicability must match the current exercise, phase, side and view; V1 accepts only unspecified age scope.');
      return;
    }
    if (result.has(trusted.itemId)) issue(issues, 'invalid_shape', path, 'Knowledge item IDs must be unique.');
    result.set(trusted.itemId, trusted);
  });
  return result;
}

function validateClaimAnnotations(
  bundle: NicoleAnatomyProBundleV1,
  bindingById: ReadonlyMap<string, NicoleAnatomyProBundleV1['claimBindings'][number]>,
  knowledgeById: ReadonlyMap<string, NicoleAnatomyKnowledgeItemV1>,
  claimById: ReadonlyMap<string, NicoleProClaimV1>,
  issues: NicoleAnatomyValidationIssueV1[],
): void {
  const annotationById = new Map<string, NicoleAnatomyClaimAnnotationV1>();
  bundle.claimAnnotations.forEach((annotation, index) => {
    const path = `claimAnnotations[${index}]`;
    if (!isObject(annotation) || !nonEmptyString(annotation.statementId) || annotationById.has(annotation.statementId)) {
      issue(issues, 'invalid_shape', path, 'Claim annotation and unique statementId are required.');
      return;
    }
    annotationById.set(annotation.statementId, annotation);
  });
  const hypotheses = bundle.claimAnnotations.filter((item): item is NicoleAnatomyHypothesisAnnotationV1 => (
    isObject(item) && item.kind === 'hypothesis_annotation'
  ));
  const tests = bundle.claimAnnotations.filter((item): item is NicoleAnatomyDifferentiationAnnotationV1 => (
    isObject(item) && item.kind === 'differentiation_annotation'
  ));
  const usedBindingIds = new Set<string>();
  const usedKnowledgeIds = new Set<string>();

  bundle.claimAnnotations.forEach((annotation, index) => {
    const path = `claimAnnotations[${index}]`;
    if (!isObject(annotation)) return;
    if (!reviewStateValid(annotation.reviewState) || !SCIENTIFIC_STATES.has(annotation.scientificValidation)
      || annotation.internalOnly !== true || annotation.outwardEligibility !== false) {
      issue(issues, 'invalid_shape', path, 'Claim annotation status and internal boundary are invalid.');
    }
    if (bundle.origin === 'ai_suggestion' && annotation.reviewState !== 'ai_draft') {
      issue(issues, 'invalid_review_state', `${path}.reviewState`, 'AI output cannot self-assert Nicole review.');
    }
    if (annotation.kind === 'hypothesis_annotation') {
      if (!hasOnlyKeys(annotation as unknown as PlainObject, [
        'statementId', 'reviewState', 'scientificValidation', 'internalOnly', 'outwardEligibility', 'kind',
        'epistemicKind', 'hypothesisDomain', 'hypothesisRole', 'modality', 'sourceClaimId', 'claimBindingIds',
        'knowledgeItemIds', 'explainsClaimIds', 'linkedDifferentiationTestIds',
      ]) || annotation.modality !== 'possible'
        || !nonEmptyString(annotation.sourceClaimId) || !uniqueStrings(annotation.claimBindingIds)
        || !uniqueStrings(annotation.knowledgeItemIds) || !uniqueStrings(annotation.explainsClaimIds)
        || !uniqueStrings(annotation.linkedDifferentiationTestIds)
        || !HYPOTHESIS_DOMAINS.has(annotation.hypothesisDomain) || !HYPOTHESIS_ROLES.has(annotation.hypothesisRole)) {
        issue(issues, 'invalid_shape', path, 'Hypothesis structure is incomplete.');
        return;
      }
      const sourceClaim = claimById.get(annotation.sourceClaimId);
      const sourceClassifications = sourceClaim
        ? [...new Set(sourceClaim.conceptIds.map(conceptId => SOURCE_CLAIM_CLASSIFICATION_BY_CONCEPT[conceptId])
          .filter(Boolean).map(canonicalJson))].map(value => JSON.parse(value) as HypothesisClassification)
        : [];
      if (!sourceClaim || sourceClaim.type !== 'teacher_hypothesis') {
        issue(issues, 'unknown_reference', `${path}.sourceClaimId`, 'Annotation must reference an exact deterministic current Nicole-Pro hypothesis claim.');
      } else if (sourceClassifications.length !== 1
        || canonicalJson(sourceClassifications[0]) !== canonicalJson({
          hypothesisDomain: annotation.hypothesisDomain,
          hypothesisRole: annotation.hypothesisRole,
          epistemicKind: annotation.epistemicKind,
        })) {
        issue(issues, 'invalid_epistemic_kind', path, 'Hypothesis epistemic kind, role and domain must match the product-owned source-claim classification.');
      }
      const bindings = annotation.claimBindingIds.map(id => bindingById.get(id));
      const boundClaimIds = bindings.flatMap(binding => binding ? [binding.claimId] : []);
      annotation.claimBindingIds.forEach(id => usedBindingIds.add(id));
      annotation.knowledgeItemIds.forEach(id => usedKnowledgeIds.add(id));
      if (bindings.some(binding => !binding) || !sameStringSet(annotation.explainsClaimIds, boundClaimIds)
        || bindings.some(binding => {
          if (!binding || !sourceClaim) return true;
          const boundClaim = claimById.get(binding.claimId);
          return !boundClaim || !['visual_observation', 'metric_observation'].includes(boundClaim.type)
            || !sameStringSet(binding.evidenceIds, boundClaim.evidenceIds)
            || !sameStringSet(sourceClaim.evidenceIds, boundClaim.evidenceIds)
            || sourceClaim.primaryEvidenceId !== boundClaim.primaryEvidenceId;
        })) {
        issue(issues, 'unknown_reference', path, 'Hypothesis annotations must bind exactly to the observed claims and evidence they explain.');
      }
      const expectedStatus = statementStatusFromKnowledge(annotation.knowledgeItemIds, knowledgeById);
      if (!expectedStatus || expectedStatus !== annotation.scientificValidation) {
        issue(issues, 'invalid_scientific_status', `${path}.scientificValidation`, 'Case knowledge status must equal the weakest referenced general-knowledge status.');
      }
    } else if (annotation.kind === 'differentiation_annotation') {
      if (!hasOnlyKeys(annotation as unknown as PlainObject, [
        'statementId', 'reviewState', 'scientificValidation', 'internalOnly', 'outwardEligibility', 'kind',
        'epistemicKind', 'sourceClaimId', 'targetHypothesisIds', 'allowedPerformer', 'safetyClass',
        'contraindicationCodes', 'outcomeCriteria', 'humanRecordedResult',
      ]) || annotation.epistemicKind !== 'differentiation_step'
        || !nonEmptyString(annotation.sourceClaimId) || !uniqueStrings(annotation.targetHypothesisIds)
        || !ALLOWED_PERFORMERS.has(annotation.allowedPerformer) || !TEST_SAFETY_CLASSES.has(annotation.safetyClass)
        || !uniqueStrings(annotation.contraindicationCodes, true)
        || annotation.contraindicationCodes.some(code => !CONTRAINDICATION_CODES.has(code))
        || !isObject(annotation.outcomeCriteria)
        || !hasOnlyKeys(annotation.outcomeCriteria, ['supports', 'weakens', 'inconclusive'])
        || annotation.outcomeCriteria.supports !== 'visible_pattern_changes_with_isolated_variable'
        || annotation.outcomeCriteria.weakens !== 'visible_pattern_unchanged_with_isolated_variable'
        || annotation.outcomeCriteria.inconclusive !== 'comparison_not_equivalent') {
        issue(issues, 'invalid_shape', path, 'Differentiation-test structure is incomplete.');
        return;
      }
      if (annotation.safetyClass === 'clinical_only'
        || (annotation.safetyClass === 'low_load_teacher_task' && annotation.contraindicationCodes.length === 0)) {
        issue(issues, 'invalid_test', path, 'Generated tests must be teacher-safe; clinical tests are not automatic content.');
      }
      if (bundle.origin === 'ai_suggestion' && annotation.humanRecordedResult !== null) {
        issue(issues, 'invalid_test', `${path}.humanRecordedResult`, 'AI/video cannot fabricate a human test result.');
      }
      const sourceClaim = claimById.get(annotation.sourceClaimId);
      if (!sourceClaim || sourceClaim.type !== 'differentiation_test') {
        issue(issues, 'unknown_reference', `${path}.sourceClaimId`, 'Annotation must reference an exact deterministic current Nicole-Pro differentiation claim.');
      }
      const targets = annotation.targetHypothesisIds.map(id => annotationById.get(id));
      if (targets.some(item => item?.kind !== 'hypothesis_annotation')) {
        issue(issues, 'unknown_reference', `${path}.targetHypothesisIds`, 'Test must target current case hypotheses.');
      } else {
        const targetSourceClaims = targets.flatMap(item => item?.kind === 'hypothesis_annotation'
          ? [claimById.get(item.sourceClaimId)] : []);
        const targetSourceClaimIds = targetSourceClaims.flatMap(claim => claim ? [claim.claimId] : []);
        if (!sourceClaim || targetSourceClaims.some(claim => !claim)
          || !sameStringSet(sourceClaim.relatedClaimIds, targetSourceClaimIds)
          || targetSourceClaims.some(claim => !claim || !sameStringSet(claim.evidenceIds, sourceClaim.evidenceIds)
            || claim.primaryEvidenceId !== sourceClaim.primaryEvidenceId)) {
          issue(issues, 'unknown_reference', `${path}.sourceClaimId`, 'Differentiation claim must target the exact source hypotheses.');
        }
        const knowledgeIds = targets.flatMap(item => item?.kind === 'hypothesis_annotation' ? item.knowledgeItemIds : []);
        const expectedStatus = statementStatusFromKnowledge([...new Set(knowledgeIds)], knowledgeById);
        if (!expectedStatus || expectedStatus !== annotation.scientificValidation) {
          issue(issues, 'invalid_scientific_status', `${path}.scientificValidation`, 'Test knowledge status must match its target hypotheses.');
        }
      }
    } else {
      issue(issues, 'invalid_shape', path, 'Unknown case-statement kind.');
    }
  });

  for (const hypothesis of hypotheses) {
    const linkedTests = hypothesis.linkedDifferentiationTestIds
      .map(id => annotationById.get(id))
      .filter((item): item is NicoleAnatomyDifferentiationAnnotationV1 => item?.kind === 'differentiation_annotation');
    if (linkedTests.length !== hypothesis.linkedDifferentiationTestIds.length
      || linkedTests.some(test => !test.targetHypothesisIds.includes(hypothesis.statementId))) {
      issue(issues, 'missing_differentiation_test', `claimAnnotations.${hypothesis.statementId}`, 'Every hypothesis requires a reciprocal safe differentiation test.');
    }
    if (hypothesis.epistemicKind === 'working_hypothesis') {
      const counters = hypotheses.filter(candidate => candidate.epistemicKind === 'counter_hypothesis'
        && intersects(candidate.explainsClaimIds, hypothesis.explainsClaimIds));
      if (counters.length === 0) {
        issue(issues, 'missing_counter_hypothesis', `claimAnnotations.${hypothesis.statementId}`, 'A working hypothesis requires a plausible counterhypothesis.');
      }
      if (!counters.some(candidate => candidate.hypothesisDomain === 'capture_artifact')) {
        issue(issues, 'missing_counter_hypothesis', `claimAnnotations.${hypothesis.statementId}`, 'A capture-artifact alternative must remain visible beside a 2D working hypothesis.');
      }
    }
  }
  if (new Set(hypotheses.map(item => item.sourceClaimId)).size !== hypotheses.length) {
    issue(issues, 'unknown_reference', 'claimAnnotations', 'Each current Nicole-Pro hypothesis claim may be classified only once.');
  }
  if (new Set(tests.map(item => item.sourceClaimId)).size !== tests.length) {
    issue(issues, 'unknown_reference', 'claimAnnotations', 'Each current Nicole-Pro differentiation claim may be used only once.');
  }
  for (const test of tests) {
    if (test.targetHypothesisIds.some(id => {
      const hypothesis = annotationById.get(id);
      return hypothesis?.kind !== 'hypothesis_annotation' || !hypothesis.linkedDifferentiationTestIds.includes(test.statementId);
    })) {
      issue(issues, 'missing_differentiation_test', `claimAnnotations.${test.statementId}`, 'Differentiation links must be reciprocal.');
    }
  }
  if (!sameStringSet([...usedBindingIds], [...bindingById.keys()])) {
    issue(issues, 'unknown_reference', 'claimBindings', 'Every claim binding must be used by a current hypothesis annotation.');
  }
  if (!sameStringSet([...usedKnowledgeIds], [...knowledgeById.keys()])) {
    issue(issues, 'unknown_reference', 'knowledgeItems', 'Every knowledge item must be used by a current hypothesis annotation.');
  }
}

function validateExpertNotes(bundle: NicoleAnatomyProBundleV1, issues: NicoleAnatomyValidationIssueV1[]): void {
  bundle.expertNotes.forEach((note, index) => {
    const path = `expertNotes[${index}]`;
    if (!isObject(note) || !hasOnlyKeys(note, [
      'noteId', 'authorId', 'createdAt', 'revision', 'text', 'nonComputational', 'internalOnly', 'outwardEligibility',
    ]) || !nonEmptyString(note.noteId) || !nonEmptyString(note.authorId) || !isIsoInstant(note.createdAt)
      || !positiveInteger(note.revision) || !nonEmptyString(note.text) || note.text.length > 10_000
      || note.nonComputational !== true || note.internalOnly !== true || note.outwardEligibility !== false) {
      issue(issues, 'invalid_shape', path, 'Expert note must be a bounded, internal, non-computational Nicole artifact.');
    }
  });
  if (new Set(bundle.expertNotes.map(item => item.noteId)).size !== bundle.expertNotes.length) {
    issue(issues, 'invalid_shape', 'expertNotes', 'Expert note IDs must be unique.');
  }
}

export function validateNicoleAnatomyProBundle(
  value: unknown,
  authority?: NicoleAnatomyTrustedValidationAuthorityV1,
  currentContext?: AnalysisContextEpochV1,
): NicoleAnatomyValidationResultV1 {
  const issues: NicoleAnatomyValidationIssueV1[] = [];
  try {
    if (!authorityIsCurrent(authority, currentContext)) {
      issue(issues, 'unknown_reference', 'authority', 'A current context-bound Nicole-Pro authority is required.');
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }
    if (!isObject(value) || !hasOnlyKeys(value, [
      'schemaVersion', 'bundleId', 'contentVersion', 'createdAt', 'supersedesBundleId', 'origin', 'context',
      'knowledgeRegistryId', 'knowledgeRegistryVersion', 'internalOnly', 'outwardEligibility', 'claimBindings',
      'knowledgeItems', 'claimAnnotations', 'humanSignals', 'safetyActions', 'expertNotes',
    ])) {
      issue(issues, 'invalid_shape', '$', 'Nicole Anatomy Pro bundle has an invalid envelope.');
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }
    const bundle = value as unknown as NicoleAnatomyProBundleV1;
    if (bundle.schemaVersion !== 1 || !nonEmptyString(bundle.bundleId) || !positiveInteger(bundle.contentVersion)
      || !isIsoInstant(bundle.createdAt) || !(bundle.supersedesBundleId === null || nonEmptyString(bundle.supersedesBundleId))
      || !['ai_suggestion', 'reviewer_note_draft'].includes(bundle.origin)
      || bundle.internalOnly !== true || bundle.outwardEligibility !== false
      || !isObject(bundle.context) || canonicalJson(bundle.context) !== canonicalJson(authority.expectedContext)
      || bundle.knowledgeRegistryId !== authority.knowledgeRegistry.registryId
      || bundle.knowledgeRegistryVersion !== authority.knowledgeRegistry.registryVersion
      || !Array.isArray(bundle.claimBindings) || !Array.isArray(bundle.knowledgeItems)
      || !Array.isArray(bundle.claimAnnotations) || !Array.isArray(bundle.humanSignals)
      || !Array.isArray(bundle.safetyActions) || !Array.isArray(bundle.expertNotes)) {
      issue(issues, 'invalid_shape', '$', 'Bundle identity, current context or internal-only boundary is invalid.');
      return Object.freeze({ valid: false, issues: Object.freeze(issues) });
    }

    const claimById = new Map(authority.nicoleProDraft.claims.map(claim => [claim.claimId, claim]));
    const evidenceIds = new Set(authority.nicoleProDraft.evidence.map(evidence => evidence.evidenceId));
    const bindingById = validateClaimBindings(bundle, claimById, evidenceIds, issues);
    const knowledgeById = validateKnowledgeItems(bundle, authority.knowledgeRegistry, authority.expectedContext, issues);

    if (bundle.origin === 'ai_suggestion') {
      if (bundle.claimBindings.length === 0 || bundle.knowledgeItems.length === 0 || bundle.claimAnnotations.length === 0) {
        issue(issues, 'invalid_shape', '$', 'AI anatomy draft requires current claims, trusted knowledge and claim annotations.');
      }
      if (bundle.humanSignals.length > 0) {
        issue(issues, 'invalid_human_signal', 'humanSignals', 'Pose/AI output cannot create human-reported or observed signals.');
      }
      if (bundle.safetyActions.length > 0) {
        issue(issues, 'invalid_safety_action', 'safetyActions', 'Safety/referral actions require a separate human-signal policy authority.');
      }
      if (bundle.expertNotes.length > 0) {
        issue(issues, 'non_computational_boundary', 'expertNotes', 'AI output cannot author Nicole expert notes.');
      }
      validateClaimAnnotations(bundle, bindingById, knowledgeById, claimById, issues);
    } else {
      if (bundle.claimBindings.length > 0 || bundle.knowledgeItems.length > 0 || bundle.claimAnnotations.length > 0
        || bundle.humanSignals.length > 0 || bundle.safetyActions.length > 0 || bundle.expertNotes.length === 0) {
        issue(issues, 'non_computational_boundary', '$', 'The current unauthenticated reviewer-note draft path is note-only and cannot change computation or safety state.');
      }
      validateExpertNotes(bundle, issues);
    }
  } catch {
    issue(issues, 'invalid_shape', '$', 'Malformed Anatomy Pro data was rejected without throwing.');
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertNicoleAnatomyProBundle(
  value: unknown,
  authority: NicoleAnatomyTrustedValidationAuthorityV1,
  currentContext: AnalysisContextEpochV1,
): asserts value is NicoleAnatomyProBundleV1 {
  const result = validateNicoleAnatomyProBundle(value, authority, currentContext);
  if (!result.valid) {
    throw new Error(result.issues.map(item => `${item.path}: ${item.message}`).join(' | '));
  }
}

/** Compile-time adapter guard: Anatomy Pro does not introduce a second claim hierarchy. */
export function anatomyAnnotationTargetClaimType(
  annotation: NicoleAnatomyClaimAnnotationV1,
): Extract<NicoleProClaimV1['type'], 'teacher_hypothesis' | 'differentiation_test'> {
  return annotation.kind === 'hypothesis_annotation' ? 'teacher_hypothesis' : 'differentiation_test';
}
