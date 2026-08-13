import {
  assessmentValueForCurrentContext,
  type AnalysisContextEpochV1,
  type BoundAssessmentV1,
} from './analysisContextGuard';
import { isGroundedTeacherGuideCurrent } from './groundedTeacherDraftEngine';
import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { NicoleProCaptureView, NicoleProEvidencePacketV1 } from '../types/nicoleProContent';
import { heuristicBaseState, heuristicEvidenceStrength } from '../types/teacherHeuristic';

const METRIC_DEFINITIONS = Object.freeze({
  shoulder_horizontal: Object.freeze({
    definitionVersion: 'shoulder-horizontal-image-v1',
    side: 'bilateral' as const,
    target: 'shoulder_line' as const,
  }),
  spine_tilt_aplomb: Object.freeze({
    definitionVersion: 'spine-center-image-vertical-v1',
    side: 'center' as const,
    target: 'spine_center' as const,
  }),
  projected_hip_line_obliquity: Object.freeze({
    definitionVersion: 'pelvis-line-image-v1',
    side: 'bilateral' as const,
    target: 'pelvis_core' as const,
  }),
});

function resolveTeacherSignal(
  value: ReadyGroundedTeacherDraft['evidence']['heuristicState'],
): NicoleProEvidencePacketV1['teacherSignal'] | null {
  const base = heuristicBaseState(value);
  if (!base) return null;
  const state = base === 'heuristic_strong_attention'
    ? 'strong_attention'
    : base === 'heuristic_attention'
      ? 'attention'
      : 'match';
  const strength = heuristicEvidenceStrength(value);
  const certainty = strength === 'weak'
    ? 'weak_evidence'
    : strength === 'uncertain'
      ? 'uncertain'
      : 'supported';
  return Object.freeze({ state, certainty });
}

function evidenceIsIdentical(
  left: ReadyGroundedTeacherDraft['evidence'],
  right: ReadyGroundedTeacherDraft['evidence'],
): boolean {
  return left.metricId === right.metricId
    && left.valueDeg === right.valueDeg
    && left.confidence === right.confidence
    && left.landmarkVisibility === right.landmarkVisibility
    && left.measurementClass === right.measurementClass
    && left.heuristicState === right.heuristicState
    && left.sourceId === right.sourceId
    && left.streamEpoch === right.streamEpoch
    && left.generation === right.generation
    && left.mediaTimeUs === right.mediaTimeUs
    && left.videoWidth === right.videoWidth
    && left.videoHeight === right.videoHeight
    && left.policyVersion === right.policyVersion
    && left.source === right.source;
}

export interface NicoleProGroundedEvidenceInput {
  groundedAssessment: BoundAssessmentV1<ReadyGroundedTeacherDraft>;
  analysisArtifactId: string;
  context: AnalysisContextEpochV1;
  view: NicoleProCaptureView;
  landmarkModel: Readonly<{ modelId: string; modelVersion: string }>;
  captureQuality: 'ready' | 'usable_with_caution';
}

/**
 * Projects the already fail-closed exact-frame teacher draft into the canonical
 * Nicole-Pro evidence contract. No metric, threshold or teacher state is
 * recalculated here.
 */
export function projectGroundedTeacherEvidence(
  input: NicoleProGroundedEvidenceInput,
): NicoleProEvidencePacketV1 | null {
  try {
    return projectGroundedTeacherEvidenceUnsafe(input);
  } catch {
    return null;
  }
}

function projectGroundedTeacherEvidenceUnsafe(
  input: NicoleProGroundedEvidenceInput,
): NicoleProEvidencePacketV1 | null {
  const draft = assessmentValueForCurrentContext(input.groundedAssessment, input.context);
  if (!draft) return null;
  const source = draft.evidence;
  const metric = METRIC_DEFINITIONS[source.metricId as keyof typeof METRIC_DEFINITIONS];
  const teacherSignal = resolveTeacherSignal(source.heuristicState);
  const minimumTeacherPolicyConfidence = 0.35;
  if (!metric
    || !teacherSignal
    || draft.target !== metric.target
    || draft.reviewState !== 'pending_nicole'
    || draft.learnerVisible !== false
    || draft.parentVisible !== false
    || !isGroundedTeacherGuideCurrent(draft.guide, {
      sourceId: source.sourceId,
      streamEpoch: source.streamEpoch,
      generation: source.generation,
      mediaTimeUs: source.mediaTimeUs,
      videoWidth: source.videoWidth,
      videoHeight: source.videoHeight,
      policyVersion: source.policyVersion,
    })
    || !evidenceIsIdentical(draft.guide.evidence, source)
    || input.analysisArtifactId.trim().length === 0
    || input.context.context.sourceId !== source.sourceId
    || !Number.isSafeInteger(input.context.generation) || input.context.generation < 0
    || !Number.isFinite(source.valueDeg) || source.valueDeg < 0
    || !Number.isFinite(source.confidence) || source.confidence < 0 || source.confidence > 1
    || (source.confidence < minimumTeacherPolicyConfidence && teacherSignal.certainty === 'supported')
    || (source.confidence >= minimumTeacherPolicyConfidence && teacherSignal.certainty === 'uncertain')
    || !Number.isFinite(source.landmarkVisibility) || source.landmarkVisibility <= 0 || source.landmarkVisibility > 1
    || !Number.isSafeInteger(source.streamEpoch) || source.streamEpoch < 0
    || !Number.isSafeInteger(source.generation) || source.generation < 0
    || !Number.isSafeInteger(source.mediaTimeUs) || source.mediaTimeUs < 0
    || !Number.isFinite(source.videoWidth) || source.videoWidth <= 1
    || !Number.isFinite(source.videoHeight) || source.videoHeight <= 1
    || source.policyVersion.trim().length === 0
    || source.measurementClass !== 'vaganova_relation'
    || source.source !== 'exact_frame_cache'
    || input.landmarkModel.modelId.trim().length === 0
    || input.landmarkModel.modelVersion.trim().length === 0) return null;

  return Object.freeze({
    schemaVersion: 1,
    evidenceId: `grounded:${source.metricId}:${source.streamEpoch}:${source.generation}:${source.mediaTimeUs}`,
    analysisArtifactId: input.analysisArtifactId,
    analysisContextFingerprint: input.context.fingerprint,
    analysisContextGeneration: input.context.generation,
    sourceId: source.sourceId,
    exerciseId: input.context.context.exerciseId,
    phaseId: 'paused_exact_frame',
    phaseLabel: 'Pausierter Analyseframe',
    phaseConfidence: 1,
    cycleIndex: 0,
    mediaTimeUs: source.mediaTimeUs,
    frameAuthority: 'exact_cache_frame',
    side: metric.side,
    view: input.view,
    videoWidth: source.videoWidth,
    videoHeight: source.videoHeight,
    metricId: source.metricId,
    definitionVersion: metric.definitionVersion,
    measurementStatus: 'experimental',
    metricInputConfidence: source.confidence,
    value: source.valueDeg,
    unit: 'deg',
    uncertainty: Object.freeze({ kind: 'not_characterized' }),
    captureQuality: input.captureQuality,
    teacherSignal,
    landmarkQuality: Object.freeze({
      status: 'measured',
      score: source.landmarkVisibility,
      modelId: input.landmarkModel.modelId,
      modelVersion: input.landmarkModel.modelVersion,
    }),
    temporalRepeatability: Object.freeze({
      status: 'not_assessed',
      comparableCycleCount: 1,
    }),
    policyVersion: source.policyVersion,
    evidenceSource: 'exact_frame_cache',
  });
}
