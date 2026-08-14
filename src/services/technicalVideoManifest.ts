import { sha256Canonical } from './cueReviewAudit';
import type {
  TechnicalVideoAsset,
  TechnicalVideoClock,
  TechnicalVideoManifest,
  TechnicalVideoManifestDraft,
  TechnicalVideoMotionContext,
  TechnicalVideoRights,
} from '../types/technicalVideoManifest';
import {
  TECHNICAL_VIDEO_MANIFEST_DIGEST_ALGORITHM,
  TECHNICAL_VIDEO_MANIFEST_SCHEMA_VERSION,
} from '../types/technicalVideoManifest';

const ASSET_ROLES = new Set(['source_video', 'technical_clip', 'thumbnail', 'contact_sheet', 'metadata', 'advisory_review']);
const MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'application/json', 'text/plain']);
const RIGHTS_BASES = new Set(['unknown', 'owned_recording', 'contractual_permission', 'purchase_license', 'official_public_permission_statement']);
const LICENSE_STATUSES = new Set(['unknown', 'unverified', 'verified']);
const PRODUCT_USE_STATUSES = new Set(['not_assessed', 'not_allowed', 'internal_technical_only', 'allowed']);
const RELEASE_STATUSES = new Set(['not_granted', 'internal_only', 'granted']);
const EVIDENCE_STATUSES = new Set(['missing', 'unverified', 'verified']);
const TECHNICAL_STATUSES = new Set(['received_unverified', 'hash_verified', 'technically_accepted', 'technically_rejected']);
const EXERCISES = new Set(['plie', 'tendu', 'passe', 'jete', 'changement']);
const VIEWS = new Set(['frontal', 'profile_left', 'profile_right']);
const SIDES = new Set(['left', 'right', 'bilateral']);
const PHASES: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  plie: new Set(['setup', 'descent', 'bottom', 'ascent', 'finish']),
  tendu: new Set(['departure', 'extension', 'full_extension', 'return', 'closure']),
});
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_VIDEO_DURATION_MS = 24 * 60 * 60 * 1000;
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const DOCUMENT_MIME_TYPES = new Set(['application/json', 'text/plain']);

function cloneFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreeze)) as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key] = cloneFreeze(item);
  return Object.freeze(result) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSafeRelativePath(value: unknown, fileName: unknown): value is string {
  if (typeof value !== 'string' || typeof fileName !== 'string' || value.length < 1 || value.length > 512) return false;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || /^[a-z]:/i.test(value) || value.includes('://') || value.includes('%') || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const segments = value.split('/');
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
    && segments[segments.length - 1] === fileName;
}

function roleAndMimeAreCompatible(role: unknown, mimeType: unknown): boolean {
  if (role === 'source_video' || role === 'technical_clip') return VIDEO_MIME_TYPES.has(mimeType as string);
  if (role === 'thumbnail' || role === 'contact_sheet') return IMAGE_MIME_TYPES.has(mimeType as string);
  return (role === 'metadata' || role === 'advisory_review') && DOCUMENT_MIME_TYPES.has(mimeType as string);
}

function fileNameMatchesMime(fileName: string, mimeType: string): boolean {
  const lower = fileName.toLocaleLowerCase('en-US');
  if (mimeType === 'video/mp4') return lower.endsWith('.mp4');
  if (mimeType === 'video/quicktime') return lower.endsWith('.mov');
  if (mimeType === 'image/jpeg') return lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  if (mimeType === 'image/png') return lower.endsWith('.png');
  if (mimeType === 'application/json') return lower.endsWith('.json');
  return mimeType === 'text/plain' && (lower.endsWith('.txt') || lower.endsWith('.md'));
}

function assetIsValid(value: unknown): value is TechnicalVideoAsset {
  if (!isRecord(value) || !hasExactKeys(value, ['assetId', 'role', 'fileName', 'relativePath', 'sha256', 'byteSize', 'mimeType', 'derivedFromAssetIds'])) return false;
  if (!isId(value.assetId) || !ASSET_ROLES.has(value.role as string)) return false;
  if (typeof value.fileName !== 'string' || value.fileName.length < 1 || value.fileName.length > 255 || /[\\/]/.test(value.fileName) || value.fileName === '.' || value.fileName === '..') return false;
  if (!isSafeRelativePath(value.relativePath, value.fileName)) return false;
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) return false;
  if (!Number.isSafeInteger(value.byteSize) || (value.byteSize as number) <= 0) return false;
  if (!MIME_TYPES.has(value.mimeType as string) || !roleAndMimeAreCompatible(value.role, value.mimeType) || !fileNameMatchesMime(value.fileName, value.mimeType as string)) return false;
  return isDenseArray(value.derivedFromAssetIds)
    && value.derivedFromAssetIds.every(isId)
    && new Set(value.derivedFromAssetIds).size === value.derivedFromAssetIds.length
    && !value.derivedFromAssetIds.includes(value.assetId);
}

function rightsAreValid(value: unknown): value is TechnicalVideoRights {
  if (!isRecord(value) || !hasExactKeys(value, ['rightsBasis', 'licenseStatus', 'productUseStatus', 'releaseStatus', 'rightsEvidenceStatus'])) return false;
  if (!RIGHTS_BASES.has(value.rightsBasis as string) || !LICENSE_STATUSES.has(value.licenseStatus as string)
    || !PRODUCT_USE_STATUSES.has(value.productUseStatus as string) || !RELEASE_STATUSES.has(value.releaseStatus as string)
    || !EVIDENCE_STATUSES.has(value.rightsEvidenceStatus as string)) return false;
  if (value.rightsBasis === 'unknown') {
    return value.licenseStatus === 'unknown'
      && (value.productUseStatus === 'not_assessed' || value.productUseStatus === 'not_allowed')
      && value.releaseStatus === 'not_granted'
      && value.rightsEvidenceStatus !== 'verified';
  }
  if (value.productUseStatus === 'allowed') {
    return value.licenseStatus === 'verified' && value.releaseStatus === 'granted' && value.rightsEvidenceStatus === 'verified';
  }
  if (value.productUseStatus === 'internal_technical_only') {
    return value.licenseStatus === 'verified'
      && (value.releaseStatus === 'internal_only' || value.releaseStatus === 'granted')
      && value.rightsEvidenceStatus === 'verified';
  }
  return value.releaseStatus !== 'granted' || value.rightsEvidenceStatus === 'verified';
}

function motionContextIsValid(value: unknown): value is TechnicalVideoMotionContext {
  if (!isRecord(value) || !hasExactKeys(value, ['classificationStatus', 'exerciseId', 'phaseId', 'view', 'workingSide'])) return false;
  if (!new Set(['not_claimed', 'source_declared', 'technically_reviewed']).has(value.classificationStatus as string)) return false;
  if (value.exerciseId !== null && !EXERCISES.has(value.exerciseId as string)) return false;
  if (value.phaseId !== null && (typeof value.phaseId !== 'string' || value.phaseId.length < 1 || value.phaseId.length > 80)) return false;
  if (value.view !== null && !VIEWS.has(value.view as string)) return false;
  if (value.workingSide !== null && !SIDES.has(value.workingSide as string)) return false;
  const anyClaim = value.exerciseId !== null || value.phaseId !== null || value.view !== null || value.workingSide !== null;
  if (value.classificationStatus === 'not_claimed') return !anyClaim;
  if (!anyClaim || value.exerciseId === null) return false;
  if (value.phaseId !== null) {
    const allowed = PHASES[value.exerciseId as string];
    if (!allowed || !allowed.has(value.phaseId as string)) return false;
  }
  return true;
}

function clockIsValid(value: unknown): value is TechnicalVideoClock {
  if (!isRecord(value) || !hasExactKeys(value, ['assetId', 'status', 'frameRateHz', 'durationMs', 'mediaTimeOrigin', 'driftToleranceMs'])) return false;
  if (!isId(value.assetId)) return false;
  if (value.status !== 'declared' && value.status !== 'measured') return false;
  if (typeof value.frameRateHz !== 'number' || !Number.isFinite(value.frameRateHz) || value.frameRateHz <= 0 || value.frameRateHz > 1000) return false;
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs <= 0 || value.durationMs > MAX_VIDEO_DURATION_MS) return false;
  if (value.mediaTimeOrigin !== 'container_pts' && value.mediaTimeOrigin !== 'embedded_timecode') return false;
  if (value.status === 'declared') return value.driftToleranceMs === null;
  return typeof value.driftToleranceMs === 'number' && Number.isFinite(value.driftToleranceMs)
    && value.driftToleranceMs >= 0 && value.driftToleranceMs <= (value.durationMs as number);
}

function assetsFormValidGraph(assets: readonly TechnicalVideoAsset[]): boolean {
  const ids = new Set(assets.map(asset => asset.assetId));
  if (ids.size !== assets.length) return false;
  if (new Set(assets.map(asset => asset.relativePath)).size !== assets.length) return false;
  if (!assets.every(asset => asset.derivedFromAssetIds.every(id => ids.has(id)))) return false;
  if (!assets.some(asset => asset.role === 'source_video' || asset.role === 'technical_clip')) return false;
  if (assets.some(asset => asset.role === 'source_video' && asset.derivedFromAssetIds.length > 0)) return false;
  const parents = new Map(assets.map(asset => [asset.assetId, asset.derivedFromAssetIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const isAcyclicFrom = (assetId: string): boolean => {
    if (visiting.has(assetId)) return false;
    if (visited.has(assetId)) return true;
    visiting.add(assetId);
    for (const parentId of parents.get(assetId) ?? []) if (!isAcyclicFrom(parentId)) return false;
    visiting.delete(assetId);
    visited.add(assetId);
    return true;
  };
  return assets.every(asset => isAcyclicFrom(asset.assetId));
}

export function technicalVideoManifestIsValid(value: unknown): value is TechnicalVideoManifest {
  try {
    if (!isRecord(value) || !hasExactKeys(value, [
      'schemaVersion', 'manifestId', 'handoffId', 'manifestVersion', 'supersedesManifestId', 'createdAt',
      'sourceKind', 'displayLabel', 'assets', 'rights', 'technicalStatus', 'subjectMatterStatus',
      'nicoleReferenceStatus', 'motionContext', 'clock', 'digestAlgorithm', 'manifestDigest',
    ])) return false;
    if (value.schemaVersion !== TECHNICAL_VIDEO_MANIFEST_SCHEMA_VERSION || !isId(value.manifestId) || !isId(value.handoffId)) return false;
    if (!Number.isSafeInteger(value.manifestVersion) || (value.manifestVersion as number) < 1) return false;
    if (value.supersedesManifestId !== null && !isId(value.supersedesManifestId)) return false;
    if (((value.manifestVersion as number) === 1) !== (value.supersedesManifestId === null)) return false;
    if (!isCanonicalIso(value.createdAt) || value.sourceKind !== 'professional_video_handoff') return false;
    if (typeof value.displayLabel !== 'string' || value.displayLabel.trim() !== value.displayLabel || value.displayLabel.length < 1 || value.displayLabel.length > 200) return false;
    if (!isDenseArray(value.assets) || value.assets.length < 1 || !value.assets.every(assetIsValid) || !assetsFormValidGraph(value.assets)) return false;
    if (!rightsAreValid(value.rights) || !TECHNICAL_STATUSES.has(value.technicalStatus as string)) return false;
    if (value.subjectMatterStatus !== 'unreviewed' || value.nicoleReferenceStatus !== 'not_claimed') return false;
    if (!motionContextIsValid(value.motionContext) || (value.clock !== null && !clockIsValid(value.clock))) return false;
    if (value.clock !== null) {
      const clockAssetId = (value.clock as TechnicalVideoClock).assetId;
      const clockAsset = value.assets.find(asset => asset.assetId === clockAssetId);
      if (!clockAsset || (clockAsset.role !== 'source_video' && clockAsset.role !== 'technical_clip')) return false;
    }
    if (value.digestAlgorithm !== TECHNICAL_VIDEO_MANIFEST_DIGEST_ALGORITHM || typeof value.manifestDigest !== 'string' || !SHA256_PATTERN.test(value.manifestDigest)) return false;
    const { manifestDigest: _digest, ...core } = value;
    return value.manifestDigest === sha256Canonical(core);
  } catch {
    return false;
  }
}

export function createTechnicalVideoManifest(draft: TechnicalVideoManifestDraft): TechnicalVideoManifest {
  const core = {
    ...draft,
    schemaVersion: TECHNICAL_VIDEO_MANIFEST_SCHEMA_VERSION,
    digestAlgorithm: TECHNICAL_VIDEO_MANIFEST_DIGEST_ALGORITHM,
  };
  const manifest = { ...core, manifestDigest: sha256Canonical(core) };
  if (!technicalVideoManifestIsValid(manifest)) throw new Error('Technical video manifest is invalid.');
  return cloneFreeze(manifest);
}

export function technicalVideoManifestHistoryIsValid(value: unknown): value is readonly TechnicalVideoManifest[] {
  try {
    if (!isDenseArray(value) || value.length < 1 || !value.every(technicalVideoManifestIsValid)) return false;
    if (new Set(value.map(item => item.manifestId)).size !== value.length) return false;
    const grouped = new Map<string, TechnicalVideoManifest[]>();
    for (const item of value) grouped.set(item.handoffId, [...(grouped.get(item.handoffId) ?? []), item]);
    for (const history of grouped.values()) {
      const ordered = history.slice().sort((a, b) => a.manifestVersion - b.manifestVersion);
      if (ordered.some((item, index) => item.manifestVersion !== index + 1)) return false;
      if (ordered.some((item, index) => index === 0 ? item.supersedesManifestId !== null : item.supersedesManifestId !== ordered[index - 1].manifestId)) return false;
      if (ordered.some((item, index) => index > 0 && Date.parse(item.createdAt) < Date.parse(ordered[index - 1].createdAt))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function technicalVideoManifestIsProductUsable(manifest: TechnicalVideoManifest): boolean {
  return technicalVideoManifestIsValid(manifest)
    && manifest.technicalStatus === 'technically_accepted'
    && manifest.rights.rightsBasis !== 'unknown'
    && manifest.rights.licenseStatus === 'verified'
    && manifest.rights.productUseStatus === 'allowed'
    && manifest.rights.releaseStatus === 'granted'
    && manifest.rights.rightsEvidenceStatus === 'verified';
}

export function technicalVideoManifestCanDriveSingleClock(manifest: TechnicalVideoManifest): boolean {
  return technicalVideoManifestIsValid(manifest)
    && (manifest.technicalStatus === 'hash_verified' || manifest.technicalStatus === 'technically_accepted')
    && manifest.clock !== null;
}
