import type { AnalysisContextEpochV1 } from './analysisContextGuard';
import {
  validateNicoleAnatomyProBundle,
  type NicoleAnatomyTrustedValidationAuthorityV1,
} from './nicoleProAnatomyValidator';
import type {
  NicoleAnatomyClaimBindingV1,
  NicoleAnatomyDifferentiationAnnotationV1,
  NicoleAnatomyHypothesisAnnotationV1,
  NicoleAnatomyHypothesisProfileV1,
  NicoleAnatomyKnowledgeItemV1,
  NicoleAnatomyProBundleV1,
  NicoleAnatomyScientificValidation,
} from '../types/nicoleProAnatomy';
import type { NicoleProClaimV1 } from '../types/nicoleProContent';

type PlainObject = Record<string, unknown>;

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

function weakestScientificStatus(
  ids: readonly string[],
  knowledgeById: ReadonlyMap<string, NicoleAnatomyKnowledgeItemV1>,
): NicoleAnatomyScientificValidation | null {
  const rank: Record<NicoleAnatomyScientificValidation, number> = {
    curated_internal: 0,
    source_supported: 1,
    externally_validated_for_stated_scope: 2,
  };
  const items = ids.map(id => knowledgeById.get(id));
  if (items.length === 0 || items.some(item => !item)) return null;
  return items.reduce((lowest, item) => (
    item && rank[item.scientificValidation] < rank[lowest] ? item.scientificValidation : lowest
  ), items[0]!.scientificValidation);
}

function profileForClaim(
  claim: NicoleProClaimV1,
  profiles: readonly NicoleAnatomyHypothesisProfileV1[],
): NicoleAnatomyHypothesisProfileV1 | null {
  const matches = profiles.filter(profile => claim.conceptIds.includes(profile.sourceConceptId));
  return matches.length === 1 ? matches[0] : null;
}

export interface NicoleAnatomyPlannerInputV1 {
  bundleId: string;
  createdAt: string;
  authority: NicoleAnatomyTrustedValidationAuthorityV1;
  currentContext: AnalysisContextEpochV1;
}

/**
 * Builds annotations over the existing deterministic Nicole-Pro claims.
 * It never creates new case text, measurements, symptoms or safety actions.
 */
export function planNicoleAnatomyProBundle(
  input: NicoleAnatomyPlannerInputV1,
): NicoleAnatomyProBundleV1 | null {
  try {
    const draft = input.authority.nicoleProDraft;
    const registry = input.authority.knowledgeRegistry;
    const observedClaims = draft.claims.filter((claim) => (
      claim.type === 'visual_observation' || claim.type === 'metric_observation'
    ));
    const hypothesisClaims = draft.claims.filter(claim => claim.type === 'teacher_hypothesis');
    const testClaims = draft.claims.filter(claim => claim.type === 'differentiation_test');
    if (observedClaims.length !== 2 || hypothesisClaims.length === 0 || testClaims.length === 0) return null;

    const bindings: NicoleAnatomyClaimBindingV1[] = observedClaims.map(claim => ({
      bindingId: `anatomy:binding:${claim.claimId}`,
      claimId: claim.claimId,
      evidenceIds: [...claim.evidenceIds],
      epistemicKind: claim.type === 'metric_observation' ? 'measurement' : 'visible_observation',
      reviewState: 'ai_draft',
      internalOnly: true,
      outwardEligibility: false,
    }));
    const bindingIds = bindings.map(binding => binding.bindingId);
    const observedClaimIds = bindings.map(binding => binding.claimId);
    const knowledgeById = new Map(registry.items.map(item => [item.itemId, item]));
    const annotationIdByHypothesisClaim = new Map(
      hypothesisClaims.map(claim => [claim.claimId, `anatomy:annotation:${claim.claimId}`]),
    );
    const annotationIdByTestClaim = new Map(
      testClaims.map(claim => [claim.claimId, `anatomy:annotation:${claim.claimId}`]),
    );

    const hypothesisAnnotations: NicoleAnatomyHypothesisAnnotationV1[] = [];
    const usedKnowledgeIds = new Set<string>();
    for (const claim of hypothesisClaims) {
      const profile = profileForClaim(claim, registry.hypothesisProfiles);
      const annotationId = annotationIdByHypothesisClaim.get(claim.claimId);
      const linkedTests = testClaims.filter(test => test.relatedClaimIds.includes(claim.claimId));
      const scientificValidation = profile
        ? weakestScientificStatus(profile.knowledgeItemIds, knowledgeById)
        : null;
      if (!profile || !annotationId || linkedTests.length !== 1 || !scientificValidation) return null;
      profile.knowledgeItemIds.forEach(id => usedKnowledgeIds.add(id));
      hypothesisAnnotations.push({
        statementId: annotationId,
        reviewState: 'ai_draft',
        scientificValidation,
        internalOnly: true,
        outwardEligibility: false,
        kind: 'hypothesis_annotation',
        epistemicKind: profile.epistemicKind,
        hypothesisDomain: profile.hypothesisDomain,
        hypothesisRole: profile.hypothesisRole,
        modality: 'possible',
        sourceClaimId: claim.claimId,
        claimBindingIds: bindingIds,
        knowledgeItemIds: [...profile.knowledgeItemIds],
        explainsClaimIds: observedClaimIds,
        linkedDifferentiationTestIds: [annotationIdByTestClaim.get(linkedTests[0].claimId)!],
      });
    }

    const hypothesisBySourceClaimId = new Map(hypothesisAnnotations.map(annotation => (
      [annotation.sourceClaimId, annotation]
    )));
    const testAnnotations: NicoleAnatomyDifferentiationAnnotationV1[] = [];
    for (const claim of testClaims) {
      const targetHypotheses = claim.relatedClaimIds.map(id => hypothesisBySourceClaimId.get(id));
      const annotationId = annotationIdByTestClaim.get(claim.claimId);
      if (!annotationId || targetHypotheses.length === 0 || targetHypotheses.some(item => !item)) return null;
      const knowledgeIds = [...new Set(targetHypotheses.flatMap(item => item!.knowledgeItemIds))];
      const scientificValidation = weakestScientificStatus(knowledgeIds, knowledgeById);
      if (!scientificValidation) return null;
      testAnnotations.push({
        statementId: annotationId,
        reviewState: 'ai_draft',
        scientificValidation,
        internalOnly: true,
        outwardEligibility: false,
        kind: 'differentiation_annotation',
        epistemicKind: 'differentiation_step',
        sourceClaimId: claim.claimId,
        targetHypothesisIds: targetHypotheses.map(item => item!.statementId),
        allowedPerformer: 'nicole',
        safetyClass: 'observation_only',
        contraindicationCodes: [],
        outcomeCriteria: {
          supports: 'visible_pattern_changes_with_isolated_variable',
          weakens: 'visible_pattern_unchanged_with_isolated_variable',
          inconclusive: 'comparison_not_equivalent',
        },
        humanRecordedResult: null,
      });
    }

    const bundle: NicoleAnatomyProBundleV1 = cloneAndDeepFreeze({
      schemaVersion: 1,
      bundleId: input.bundleId,
      contentVersion: 1,
      createdAt: input.createdAt,
      supersedesBundleId: null,
      origin: 'ai_suggestion',
      context: input.authority.expectedContext,
      knowledgeRegistryId: registry.registryId,
      knowledgeRegistryVersion: registry.registryVersion,
      internalOnly: true,
      outwardEligibility: false,
      claimBindings: bindings,
      knowledgeItems: registry.items.filter(item => usedKnowledgeIds.has(item.itemId)),
      claimAnnotations: [...hypothesisAnnotations, ...testAnnotations],
      humanSignals: [],
      safetyActions: [],
      expertNotes: [],
    });
    return validateNicoleAnatomyProBundle(bundle, input.authority, input.currentContext).valid
      ? bundle
      : null;
  } catch {
    return null;
  }
}
