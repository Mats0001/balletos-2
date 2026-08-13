import {
  assessmentValueForCurrentContext,
  type AnalysisContextEpochV1,
  type BoundAssessmentV1,
} from './analysisContextGuard';
import {
  createNicoleProValidationAuthority,
  nicoleProStatementMatchesEvidence,
  nicoleProStatementSemanticKey,
  projectNicoleProStatementText,
  formatNicoleProEvidenceValue,
  type NicoleProTrustedValidationAuthorityV1,
  NICOLE_PRO_VALIDATOR_VERSION,
  validateNicoleProDraft,
} from './nicoleProContentValidator';
import { projectGroundedTeacherEvidence } from './nicoleProGroundedEvidence';
import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { NicoleProCaptureView } from '../types/nicoleProContent';
import type { SelectedSkeletonTarget } from '../types/skeletonTarget';
import { heuristicBaseState, heuristicEvidenceStrength } from '../types/teacherHeuristic';
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

export interface NicoleProGroundedPlannerInput {
  groundedAssessment: BoundAssessmentV1<ReadyGroundedTeacherDraft>;
  currentContext: AnalysisContextEpochV1;
  analysisArtifactId: string;
  view: NicoleProCaptureView;
  landmarkModel: Readonly<{ modelId: string; modelVersion: string }>;
  captureQuality: 'ready' | 'usable_with_caution';
  draftId: string;
  generatedAt: string;
}

export type NicoleProCaptureQuality = 'ready' | 'usable_with_caution';
export type NicoleProLandmarkModel = Readonly<{ modelId: string; modelVersion: string }>;

export const NICOLE_PRO_LANDMARK_MODEL_V1: NicoleProLandmarkModel = Object.freeze({
  modelId: 'mediapipe-pose',
  modelVersion: '0.5.1675469404:model-complexity-1',
});

export function createNicoleProExactFrameArtifactId(
  context: AnalysisContextEpochV1,
  mediaTimeUs: number,
  landmarkModel: NicoleProLandmarkModel,
): string {
  return `exact-frame:${context.fingerprint}:${context.generation}:${mediaTimeUs}:${landmarkModel.modelId}@${landmarkModel.modelVersion}`;
}

const TARGET_IDS_BY_GROUNDED_METRIC = Object.freeze({
  spine_tilt_aplomb: [
    'bone.neck_sternum', 'bone.sternum_navel', 'bone.navel_pelvis', 'bone.torso_side_l', 'bone.torso_side_r',
  ] as const,
  shoulder_horizontal: ['bone.shoulder_line'] as const,
  projected_hip_line_obliquity: ['bone.pelvis_line'] as const,
}) satisfies Readonly<Record<ReadyGroundedTeacherDraft['evidence']['metricId'], readonly SelectedSkeletonTarget['targetId'][]>>;

export function groundedDraftMatchesCurrentSelection(input: Readonly<{
  grounded: ReadyGroundedTeacherDraft | null;
  currentContext: AnalysisContextEpochV1 | null;
  selectedTarget: SelectedSkeletonTarget | null;
  captureQuality: NicoleProCaptureQuality | null;
}>): boolean {
  try {
    const grounded = input.grounded;
    const selected = input.selectedTarget;
    return Boolean(grounded && input.currentContext && selected && input.captureQuality
      && selected.frameStatus === 'exact_cache_frame'
      && (TARGET_IDS_BY_GROUNDED_METRIC[grounded.evidence.metricId] as readonly SelectedSkeletonTarget['targetId'][])
        .includes(selected.targetId)
      && input.currentContext.context.sourceId === grounded.evidence.sourceId
      && selected.sourceId === grounded.evidence.sourceId
      && selected.streamEpoch === grounded.evidence.streamEpoch
      && selected.generation === grounded.evidence.generation
      && selected.mediaTimeUs === grounded.evidence.mediaTimeUs
      && grounded.reviewState === 'pending_nicole'
      && grounded.learnerVisible === false
      && grounded.parentVisible === false);
  } catch {
    return false;
  }
}

function expectedTeacherSignal(
  state: ReadyGroundedTeacherDraft['evidence']['heuristicState'],
): NicoleProEvidencePacketV1['teacherSignal'] | null {
  const base = heuristicBaseState(state);
  if (!base) return null;
  const strength = heuristicEvidenceStrength(state);
  return Object.freeze({
    state: base === 'heuristic_strong_attention'
      ? 'strong_attention'
      : base === 'heuristic_attention'
        ? 'attention'
        : 'match',
    certainty: strength === 'weak'
      ? 'weak_evidence'
      : strength === 'uncertain'
        ? 'uncertain'
        : 'supported',
  });
}

/**
 * One capability contract for display, clipboard and later persistence.
 * It binds the selected exact skeleton frame, the Grounded observation and the
 * Nicole-Pro plan to the same current context and explicit recording gate.
 */
export function nicoleProDraftMatchesGroundedSelection(input: Readonly<{
  grounded: ReadyGroundedTeacherDraft | null;
  pro: NicoleProDraftV1 | null;
  currentContext: AnalysisContextEpochV1 | null;
  selectedTarget: SelectedSkeletonTarget | null;
  captureQuality: NicoleProCaptureQuality | null;
  landmarkModel: NicoleProLandmarkModel | null;
}>): boolean {
  try {
    const grounded = input.grounded;
    const pro = input.pro;
    const selected = input.selectedTarget;
    const evidence = pro?.evidence.length === 1 ? pro.evidence[0] : null;
    const expectedSignal = grounded ? expectedTeacherSignal(grounded.evidence.heuristicState) : null;
    if (!groundedDraftMatchesCurrentSelection({
      grounded,
      currentContext: input.currentContext,
      selectedTarget: selected,
      captureQuality: input.captureQuality,
    })
      || !grounded || !pro || !evidence || !expectedSignal || !input.currentContext
      || !selected || !input.captureQuality || !input.landmarkModel
      || pro.reviewState !== 'pending_nicole' || pro.learnerVisible || pro.parentVisible
      || evidence.analysisContextFingerprint !== input.currentContext.fingerprint
      || evidence.analysisContextGeneration !== input.currentContext.generation
      || evidence.exerciseId !== input.currentContext.context.exerciseId
      || evidence.sourceId !== grounded.evidence.sourceId
      || evidence.sourceId !== selected.sourceId
      || evidence.mediaTimeUs !== grounded.evidence.mediaTimeUs
      || evidence.mediaTimeUs !== selected.mediaTimeUs
      || selected.streamEpoch !== grounded.evidence.streamEpoch
      || selected.generation !== grounded.evidence.generation
      || evidence.evidenceId !== `grounded:${grounded.evidence.metricId}:${grounded.evidence.streamEpoch}:${grounded.evidence.generation}:${grounded.evidence.mediaTimeUs}`
      || evidence.analysisArtifactId !== createNicoleProExactFrameArtifactId(
        input.currentContext, grounded.evidence.mediaTimeUs, input.landmarkModel,
      )
      || evidence.metricId !== grounded.evidence.metricId
      || evidence.value !== grounded.evidence.valueDeg
      || evidence.metricInputConfidence !== grounded.evidence.confidence
      || evidence.landmarkQuality.score !== grounded.evidence.landmarkVisibility
      || evidence.videoWidth !== grounded.evidence.videoWidth
      || evidence.videoHeight !== grounded.evidence.videoHeight
      || evidence.policyVersion !== grounded.evidence.policyVersion
      || evidence.captureQuality !== input.captureQuality
      || evidence.landmarkQuality.modelId !== input.landmarkModel.modelId
      || evidence.landmarkQuality.modelVersion !== input.landmarkModel.modelVersion
      || evidence.evidenceSource !== 'exact_frame_cache'
      || evidence.frameAuthority !== 'exact_cache_frame'
      || evidence.teacherSignal.state !== expectedSignal.state
      || evidence.teacherSignal.certainty !== expectedSignal.certainty) return false;
    return true;
  } catch {
    return false;
  }
}

export function currentNicoleProDraftForGrounded(input: Readonly<{
  groundedAssessment: BoundAssessmentV1<ReadyGroundedTeacherDraft> | null;
  proAssessment: BoundAssessmentV1<NicoleProDraftV1> | null;
  currentContext: AnalysisContextEpochV1 | null;
  selectedTarget: SelectedSkeletonTarget | null;
  captureQuality: NicoleProCaptureQuality | null;
  landmarkModel: NicoleProLandmarkModel | null;
}>): NicoleProDraftV1 | null {
  try {
    const grounded = assessmentValueForCurrentContext(input.groundedAssessment, input.currentContext);
    const pro = assessmentValueForCurrentContext(input.proAssessment, input.currentContext);
    return nicoleProDraftMatchesGroundedSelection({
      grounded,
      pro,
      currentContext: input.currentContext,
      selectedTarget: input.selectedTarget,
      captureQuality: input.captureQuality,
      landmarkModel: input.landmarkModel,
    }) ? pro : null;
  } catch {
    return null;
  }
}

/** Complete fail-closed Grounded → Evidence → Authority → Pro planning path. */
export function planNicoleProGroundedDraft(input: NicoleProGroundedPlannerInput): NicoleProDraftV1 | null {
  try {
    const evidence = projectGroundedTeacherEvidence({
      groundedAssessment: input.groundedAssessment,
      analysisArtifactId: input.analysisArtifactId,
      context: input.currentContext,
      view: input.view,
      landmarkModel: input.landmarkModel,
      captureQuality: input.captureQuality,
    });
    if (!evidence) return null;
    const authority = createNicoleProValidationAuthority({
      currentContext: input.currentContext,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: input.currentContext.fingerprint,
        contextGeneration: input.currentContext.generation,
        value: {
          analysisArtifactId: evidence.analysisArtifactId,
          sourceId: evidence.sourceId,
          exerciseId: evidence.exerciseId,
          policyVersion: evidence.policyVersion,
          evidence: [evidence],
        },
      },
    });
    return authority ? planNicoleProDraft({
      draftId: input.draftId,
      generatedAt: input.generatedAt,
      evidenceId: evidence.evidenceId,
      authority,
      currentContext: input.currentContext,
    }) : null;
  } catch {
    return null;
  }
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
