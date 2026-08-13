import type { AnalysisContextEpochV1 } from './analysisContextGuard';
import {
  nicoleProStatementMatchesEvidence,
  nicoleProStatementSemanticKey,
  projectNicoleProStatementText,
  formatNicoleProEvidenceValue,
  type NicoleProTrustedValidationAuthorityV1,
  NICOLE_PRO_VALIDATOR_VERSION,
  validateNicoleProDraft,
} from './nicoleProContentValidator';
import type {
  NicoleProClaimType,
  NicoleProClaimV1,
  NicoleProDraftV1,
  NicoleProEvidencePacketV1,
  NicoleProKnowledgeStatementV1,
} from '../types/nicoleProContent';

export const NICOLE_PRO_PLANNER_ID = 'balletos-nicole-pro-deterministic-planner' as const;
export const NICOLE_PRO_PLANNER_VERSION = '1.0.0' as const;

const TEACHER_ONLY_TYPES = new Set<NicoleProClaimType>([
  'metric_observation', 'teacher_hypothesis', 'differentiation_test', 'technical_limitation',
]);

function cloneAndDeepFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndDeepFreeze)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneAndDeepFreeze(item)]),
    )) as T;
  }
  return value;
}

function claimId(draftId: string, statementId: string): string {
  return `${draftId}:claim:${statementId}`;
}

function createClaim(
  draftId: string,
  statement: NicoleProKnowledgeStatementV1,
  evidence: NicoleProEvidencePacketV1,
  ruleId: string,
  hypothesisPriority: number | null,
): NicoleProClaimV1 | null {
  const text = projectNicoleProStatementText(statement, evidence);
  if (!text) return null;
  const numericValue = statement.textTemplate.includes('{value}')
    ? formatNicoleProEvidenceValue(evidence)
    : null;
  return {
    schemaVersion: 1,
    claimId: claimId(draftId, statement.statementId),
    type: statement.claimType,
    text,
    primaryEvidenceId: evidence.evidenceId,
    semanticKey: nicoleProStatementSemanticKey(statement),
    polarity: statement.polarity,
    evidenceIds: [evidence.evidenceId],
    knowledgeRuleIds: [ruleId],
    conceptIds: [...new Set([statement.subjectConceptId, statement.objectConceptId])],
    numericEvidenceRefs: numericValue ? [{
      token: numericValue,
      evidenceId: evidence.evidenceId,
      metricId: evidence.metricId,
      definitionVersion: evidence.definitionVersion,
    }] : [],
    relatedClaimIds: statement.claimType === 'differentiation_test'
      ? statement.relatedStatementIds.map(statementId => claimId(draftId, statementId))
      : [],
    hypothesisPriority: statement.claimType === 'teacher_hypothesis'
      ? hypothesisPriority as 1 | 2 | 3 | 4
      : null,
    studentEligibility: TEACHER_ONLY_TYPES.has(statement.claimType)
      ? 'teacher_only'
      : 'candidate_after_nicole_approval',
    statementId: statement.statementId,
  };
}

function claimsOfType(
  claims: readonly NicoleProClaimV1[],
  ...types: readonly NicoleProClaimType[]
): readonly string[] {
  const accepted = new Set(types);
  return claims.filter(claim => accepted.has(claim.type)).map(claim => claim.claimId);
}

export interface NicoleProPlannerInput {
  draftId: string;
  generatedAt: string;
  evidenceId: string;
  authority: NicoleProTrustedValidationAuthorityV1;
  currentContext: AnalysisContextEpochV1;
}

/** Produces only content already represented by trusted rule statements. */
export function planNicoleProDraft(input: NicoleProPlannerInput): NicoleProDraftV1 | null {
  try {
    return planNicoleProDraftUnsafe(input);
  } catch {
    return null;
  }
}

function planNicoleProDraftUnsafe(input: NicoleProPlannerInput): NicoleProDraftV1 | null {
  const evidence = input.authority.evidence.find(item => item.evidenceId === input.evidenceId);
  if (!evidence || input.draftId.trim().length === 0) return null;
  const matchingRules = input.authority.knowledgeRegistry.rules.filter(rule => (
    rule.statements.length > 0
    && rule.statements.every(statement => nicoleProStatementMatchesEvidence(statement, evidence))
  ));
  if (matchingRules.length !== 1) return null;
  const rule = matchingRules[0];
  let hypothesisPriority = 0;
  const claims = rule.statements.map(statement => {
    if (statement.claimType === 'teacher_hypothesis') hypothesisPriority += 1;
    return createClaim(
      input.draftId,
      statement,
      evidence,
      rule.ruleId,
      statement.claimType === 'teacher_hypothesis' ? hypothesisPriority : null,
    );
  });
  if (claims.some(claim => claim === null) || hypothesisPriority < 1 || hypothesisPriority > 4) return null;
  const typedClaims = claims as NicoleProClaimV1[];
  const draft: NicoleProDraftV1 = cloneAndDeepFreeze({
    schemaVersion: 1,
    draftId: input.draftId,
    plannerId: NICOLE_PRO_PLANNER_ID,
    plannerVersion: NICOLE_PRO_PLANNER_VERSION,
    validatorVersion: NICOLE_PRO_VALIDATOR_VERSION,
    policyVersion: evidence.policyVersion,
    generatedAt: input.generatedAt,
    reviewState: 'pending_nicole',
    learnerVisible: false,
    parentVisible: false,
    evidence: [evidence],
    knowledgeRules: [rule],
    claims: typedClaims,
    sections: {
      finding: claimsOfType(typedClaims, 'visual_observation', 'metric_observation'),
      interpretation: claimsOfType(typedClaims, 'biomechanical_interpretation'),
      hypotheses: claimsOfType(typedClaims, 'teacher_hypothesis'),
      differentiationTests: claimsOfType(typedClaims, 'differentiation_test'),
      targetAndPractice: claimsOfType(typedClaims, 'teaching_target', 'immediate_cue', 'practice', 'success_criterion'),
      metaphor: claimsOfType(typedClaims, 'metaphor'),
      measurementDetails: claimsOfType(typedClaims, 'metric_observation', 'technical_limitation'),
    },
  });
  return validateNicoleProDraft(draft, input.authority, input.currentContext).valid
    ? draft
    : null;
}
