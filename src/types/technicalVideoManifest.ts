import type { BalletMotionId } from './motionRegistry';

export const TECHNICAL_VIDEO_MANIFEST_SCHEMA_VERSION = 1 as const;
export const TECHNICAL_VIDEO_MANIFEST_DIGEST_ALGORITHM = 'sha256-canonical-json-v1' as const;

export type TechnicalVideoAssetRole =
  | 'source_video'
  | 'technical_clip'
  | 'thumbnail'
  | 'contact_sheet'
  | 'metadata'
  | 'advisory_review';

export type TechnicalVideoMimeType =
  | 'video/mp4'
  | 'video/quicktime'
  | 'image/jpeg'
  | 'image/png'
  | 'application/json'
  | 'text/plain';

export interface TechnicalVideoAsset {
  assetId: string;
  role: TechnicalVideoAssetRole;
  fileName: string;
  /** Package-relative POSIX path only. Host/Vault paths never enter the product manifest. */
  relativePath: string;
  sha256: string;
  byteSize: number;
  mimeType: TechnicalVideoMimeType;
  derivedFromAssetIds: readonly string[];
}

export interface TechnicalVideoRights {
  rightsBasis:
    | 'unknown'
    | 'owned_recording'
    | 'contractual_permission'
    | 'purchase_license'
    | 'official_public_permission_statement';
  licenseStatus: 'unknown' | 'unverified' | 'verified';
  productUseStatus: 'not_assessed' | 'not_allowed' | 'internal_technical_only' | 'allowed';
  releaseStatus: 'not_granted' | 'internal_only' | 'granted';
  rightsEvidenceStatus: 'missing' | 'unverified' | 'verified';
}

export interface TechnicalVideoMotionContext {
  classificationStatus: 'not_claimed' | 'source_declared' | 'technically_reviewed';
  exerciseId: BalletMotionId | null;
  phaseId: string | null;
  view: 'frontal' | 'profile_left' | 'profile_right' | null;
  workingSide: 'left' | 'right' | 'bilateral' | null;
}

export interface TechnicalVideoClock {
  assetId: string;
  status: 'declared' | 'measured';
  frameRateHz: number;
  durationMs: number;
  mediaTimeOrigin: 'container_pts' | 'embedded_timecode';
  driftToleranceMs: number | null;
}

export interface TechnicalVideoManifest {
  schemaVersion: typeof TECHNICAL_VIDEO_MANIFEST_SCHEMA_VERSION;
  manifestId: string;
  handoffId: string;
  manifestVersion: number;
  supersedesManifestId: string | null;
  createdAt: string;
  sourceKind: 'professional_video_handoff';
  displayLabel: string;
  assets: readonly TechnicalVideoAsset[];
  rights: TechnicalVideoRights;
  technicalStatus: 'received_unverified' | 'hash_verified' | 'technically_accepted' | 'technically_rejected';
  subjectMatterStatus: 'unreviewed';
  /** A technical ingress record is never itself a Nicole reference. */
  nicoleReferenceStatus: 'not_claimed';
  motionContext: TechnicalVideoMotionContext;
  clock: TechnicalVideoClock | null;
  digestAlgorithm: typeof TECHNICAL_VIDEO_MANIFEST_DIGEST_ALGORITHM;
  manifestDigest: string;
}

export type TechnicalVideoManifestDraft = Omit<
  TechnicalVideoManifest,
  'schemaVersion' | 'digestAlgorithm' | 'manifestDigest'
>;
