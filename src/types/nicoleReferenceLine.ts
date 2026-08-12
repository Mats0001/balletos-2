import type { SkeletonTargetId } from './skeletonTarget';

export const NICOLE_REFERENCE_SCHEMA_VERSION = 1 as const;
export const NICOLE_REFERENCE_DIGEST_ALGORITHM = 'sha256-canonical-json-v1' as const;

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
