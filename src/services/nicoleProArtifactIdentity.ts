import type { AnalysisContextEpochV1 } from './analysisContextGuard';

export type NicoleProLandmarkModel = Readonly<{ modelId: string; modelVersion: string }>;

export const NICOLE_PRO_ARTIFACT_KEY_SCHEME_V1 = 'exact-frame-context-model-v1' as const;

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

export function createNicoleProVersionedDraftId(input: Readonly<{
  context: AnalysisContextEpochV1;
  mediaTimeUs: number;
  landmarkModel: NicoleProLandmarkModel;
  metricId: string;
  policyVersion: string;
  registryId: string;
  registryVersion: string;
  plannerId: string;
  plannerVersion: string;
  validatorVersion: string;
}>): string {
  return [
    'nicole-pro',
    createNicoleProExactFrameArtifactId(input.context, input.mediaTimeUs, input.landmarkModel),
    input.metricId,
    input.policyVersion,
    `registry@${input.registryId}@${input.registryVersion}`,
    `planner@${input.plannerId}@${input.plannerVersion}`,
    `validator@${input.validatorVersion}`,
  ].join(':');
}
