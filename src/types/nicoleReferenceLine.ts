import type { SkeletonTargetId } from './skeletonTarget';

export const NICOLE_REFERENCE_SCHEMA_VERSION = 1 as const;
export const NICOLE_REFERENCE_DIGEST_ALGORITHM = 'sha256-canonical-json-v1' as const;

interface NicoleReferencePhaseBindingBase {
  schemaVersion: 1;
  perspectivePlane: 'frontal' | 'profile';
  levelLabel: string;
  policyVersion: string;
  reviewState: 'nicole_approved';
  /**
   * Exact detected source-phase window. Optional only for legacy same-video
   * lines; cross-video use requires all three values.
   */
  sourcePhaseStartMs?: number;
  sourcePhaseEndMs?: number;
  sourcePhaseRepresentativeTimeMs?: number;
}

export type NicoleReferencePhaseBinding = NicoleReferencePhaseBindingBase & (
  | Readonly<{
    exerciseId: 'plie';
    phaseId: 'setup' | 'descent' | 'bottom' | 'ascent' | 'finish';
  }>
  | Readonly<{
    exerciseId: 'tendu';
    phaseId: 'departure' | 'extension' | 'full_extension' | 'return' | 'closure';
  }>
);

export interface NicoleReferenceLineVersion {
  schemaVersion: typeof NICOLE_REFERENCE_SCHEMA_VERSION;
  versionId: string;
  versionNumber: number;
  teacherId: 'nicole';
  createdAt: string;
  sourceMediaTimeUs: number;
  videoWidth: number;
  videoHeight: number;
  /** Unit vector in source-video pixel space. It records direction, not a universal body norm. */
  direction: Readonly<{ x: number; y: number }>;
  sourceSegmentLengthPx: number;
  label: 'Nicole-Referenzlinie';
  /** Optional for legacy V1 lines; new post-analysis saves bind the line to its exact teaching phase. */
  phaseBinding?: NicoleReferencePhaseBinding;
  digestAlgorithm: typeof NICOLE_REFERENCE_DIGEST_ALGORITHM;
  versionDigest: string;
}

export interface NicoleReferenceLineRecord {
  schemaVersion: typeof NICOLE_REFERENCE_SCHEMA_VERSION;
  recordId: string;
  videoSourceId: string;
  targetId: SkeletonTargetId;
  targetKind: 'bone';
  currentVersionId: string;
  versions: readonly NicoleReferenceLineVersion[];
  digestAlgorithm: typeof NICOLE_REFERENCE_DIGEST_ALGORITHM;
  recordDigest: string;
}

/** Validated, immutable renderer projection. It contains no traffic-light verdict. */
export interface NicoleReferenceLineGuide {
  schemaVersion: typeof NICOLE_REFERENCE_SCHEMA_VERSION;
  recordId: string;
  versionId: string;
  versionNumber: number;
  videoSourceId: string;
  targetId: SkeletonTargetId;
  targetKind: 'bone';
  videoWidth: number;
  videoHeight: number;
  sourceMediaTimeUs: number;
  direction: Readonly<{ x: number; y: number }>;
  label: 'Nicole-Referenzlinie';
  teacherId: 'nicole';
  versionDigest: string;
  digestAlgorithm: typeof NICOLE_REFERENCE_DIGEST_ALGORITHM;
  guideDigest: string;
}

export interface NicoleReferenceFrameContext {
  sourceId: string;
  streamEpoch: number;
  generation: number;
  mediaTimeUs: number;
  videoWidth: number;
  videoHeight: number;
}
