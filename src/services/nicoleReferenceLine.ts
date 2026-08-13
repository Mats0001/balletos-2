import { vaganova3DKinematics } from './vaganova3DKinematics';
import type { PosePacket } from '../types/posePacket';
import { sha256Canonical } from './cueReviewAudit';
import {
  getSkeletonTarget,
  getSkeletonTargetPoints,
  isSkeletonTargetGeometryUsable,
} from './skeletonTargetRegistry';
import type {
  NicoleReferenceFrameContext,
  NicoleReferenceLineGuide,
  NicoleReferenceLineRecord,
  NicoleReferenceLineVersion,
  NicoleReferencePhaseBinding,
} from '../types/nicoleReferenceLine';
import {
  NICOLE_REFERENCE_DIGEST_ALGORITHM,
  NICOLE_REFERENCE_SCHEMA_VERSION,
} from '../types/nicoleReferenceLine';
import type {
  SelectedSkeletonTarget,
  SkeletonTargetDefinition,
  SkeletonTargetId,
} from '../types/skeletonTarget';

const STORAGE_KEY = 'balletos_nicole_reference_lines_v1';
const QUARANTINE_KEY = `${STORAGE_KEY}_quarantine`;

interface NicoleReferenceEnvelope {
  schemaVersion: typeof NICOLE_REFERENCE_SCHEMA_VERSION;
  records: readonly NicoleReferenceLineRecord[];
}

export interface NicoleReferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveNicoleReferenceLineInput {
  storage: NicoleReferenceStorage;
  videoSourceId: string;
  selectedTarget: SelectedSkeletonTarget;
  posePacket: PosePacket;
  frame: NicoleReferenceFrameContext;
  phaseBinding?: NicoleReferencePhaseBinding;
  now?: () => Date;
  createId?: () => string;
}

function cloneFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreeze)) as T;
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) result[key] = cloneFreeze(record[key]);
  return Object.freeze(result) as T;
}

const isFinitePositive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const PHASE_IDS = new Set(['setup', 'descent', 'bottom', 'ascent', 'finish']);

export function nicoleReferencePhaseBindingIsValid(
  value: unknown,
): value is NicoleReferencePhaseBinding {
  if (!value || typeof value !== 'object') return false;
  const binding = value as NicoleReferencePhaseBinding;
  return binding.schemaVersion === 1
    && binding.exerciseId === 'plie'
    && PHASE_IDS.has(binding.phaseId)
    && (binding.perspectivePlane === 'frontal' || binding.perspectivePlane === 'profile')
    && typeof binding.levelLabel === 'string' && binding.levelLabel.trim().length > 0
    && typeof binding.policyVersion === 'string' && binding.policyVersion.length > 0
    && binding.reviewState === 'nicole_approved';
}

function versionCore(version: Omit<NicoleReferenceLineVersion, 'versionDigest'>) {
  return version;
}

function recordCore(record: Omit<NicoleReferenceLineRecord, 'recordDigest'>) {
  return record;
}

export function nicoleReferenceVersionIsValid(value: unknown): value is NicoleReferenceLineVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as NicoleReferenceLineVersion;
  if (
    version.schemaVersion !== NICOLE_REFERENCE_SCHEMA_VERSION
    || typeof version.versionId !== 'string' || version.versionId.length === 0
    || !Number.isInteger(version.versionNumber) || version.versionNumber < 1
    || version.teacherId !== 'nicole'
    || typeof version.createdAt !== 'string' || !Number.isFinite(Date.parse(version.createdAt))
    || !Number.isInteger(version.sourceMediaTimeUs) || version.sourceMediaTimeUs < 0
    || !isFinitePositive(version.videoWidth) || !isFinitePositive(version.videoHeight)
    || !version.direction || !Number.isFinite(version.direction.x) || !Number.isFinite(version.direction.y)
    || !isFinitePositive(version.sourceSegmentLengthPx)
    || version.label !== 'Nicole-Referenzlinie'
    || (version.phaseBinding !== undefined && !nicoleReferencePhaseBindingIsValid(version.phaseBinding))
    || version.digestAlgorithm !== NICOLE_REFERENCE_DIGEST_ALGORITHM
    || typeof version.versionDigest !== 'string' || version.versionDigest.length !== 64
  ) return false;
  const magnitude = Math.hypot(version.direction.x, version.direction.y);
  if (Math.abs(magnitude - 1) > 1e-9) return false;
  const { versionDigest: _digest, ...core } = version;
  return version.versionDigest === sha256Canonical(core);
}

export function nicoleReferenceRecordIsValid(value: unknown): value is NicoleReferenceLineRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as NicoleReferenceLineRecord;
  if (
    record.schemaVersion !== NICOLE_REFERENCE_SCHEMA_VERSION
    || typeof record.recordId !== 'string' || record.recordId.length === 0
    || typeof record.videoSourceId !== 'string' || record.videoSourceId.length === 0
    || typeof record.targetId !== 'string' || !record.targetId.startsWith('bone.')
    || getSkeletonTarget(record.targetId)?.kind !== 'bone'
    || record.targetKind !== 'bone'
    || typeof record.currentVersionId !== 'string' || record.currentVersionId.length === 0
    || !Array.isArray(record.versions) || record.versions.length === 0
    || record.digestAlgorithm !== NICOLE_REFERENCE_DIGEST_ALGORITHM
    || typeof record.recordDigest !== 'string' || record.recordDigest.length !== 64
  ) return false;
  if (!record.versions.every(nicoleReferenceVersionIsValid)) return false;
  if (record.versions.some((version, index) => version.versionNumber !== index + 1)) return false;
  if (new Set(record.versions.map(version => version.versionId)).size !== record.versions.length) return false;
  if (record.versions[record.versions.length - 1].versionId !== record.currentVersionId) return false;
  const { recordDigest: _digest, ...core } = record;
  return record.recordDigest === sha256Canonical(core);
}

function parseEnvelope(raw: string): NicoleReferenceEnvelope | null {
  try {
    const value = JSON.parse(raw) as NicoleReferenceEnvelope;
    if (
      !value || value.schemaVersion !== NICOLE_REFERENCE_SCHEMA_VERSION
      || !Array.isArray(value.records)
      || !value.records.every(nicoleReferenceRecordIsValid)
    ) return null;
    if (new Set(value.records.map(record => record.recordId)).size !== value.records.length) return null;
    if (new Set(value.records.map(record => `${record.videoSourceId}\u0000${record.targetId}`)).size !== value.records.length) return null;
    const versionIds = value.records.flatMap(record => record.versions.map(version => version.versionId));
    if (new Set(versionIds).size !== versionIds.length) return null;
    if (value.records.some(record => versionIds.includes(record.recordId))) return null;
    return cloneFreeze(value);
  } catch {
    return null;
  }
}

export function loadNicoleReferenceLines(storage: NicoleReferenceStorage): readonly NicoleReferenceLineRecord[] {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return Object.freeze([]);
  }
  if (raw === null) return Object.freeze([]);
  const envelope = parseEnvelope(raw);
  if (envelope) return envelope.records;
  try { storage.setItem(QUARANTINE_KEY, raw); } catch {}
  return Object.freeze([]);
}

function loadNicoleReferenceLinesForWrite(storage: NicoleReferenceStorage): readonly NicoleReferenceLineRecord[] {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('Nicole reference storage could not be read.');
  }
  if (raw === null) return Object.freeze([]);
  const envelope = parseEnvelope(raw);
  if (!envelope) throw new Error('Nicole reference storage is invalid; write was refused.');
  return envelope.records;
}

function persistRecords(storage: NicoleReferenceStorage, records: readonly NicoleReferenceLineRecord[]): void {
  const envelope = {
    schemaVersion: NICOLE_REFERENCE_SCHEMA_VERSION,
    records,
  } satisfies NicoleReferenceEnvelope;
  if (!parseEnvelope(JSON.stringify(envelope))) throw new Error('Nicole reference storage contract is invalid.');
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

function makeVersion(
  input: SaveNicoleReferenceLineInput,
  target: SkeletonTargetDefinition,
  versionNumber: number,
  versionId: string,
): NicoleReferenceLineVersion {
  const skeleton = vaganova3DKinematics.solve(
    input.posePacket.landmarks,
    input.posePacket.worldLandmarks ?? null,
    input.frame.videoWidth,
    input.frame.videoHeight,
  );
  if (!isSkeletonTargetGeometryUsable(skeleton, target)) {
    throw new Error('Selected bone has no usable exact packet geometry.');
  }
  const points = getSkeletonTargetPoints(skeleton, target);
  if (points.some(point => (
    point.x < 0 || point.x > input.frame.videoWidth
    || point.y < 0 || point.y > input.frame.videoHeight
  ))) throw new Error('Selected bone lies outside the exact video frame.');
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const length = Math.hypot(dx, dy);
  if (!isFinitePositive(length)) throw new Error('Selected bone has no usable direction.');
  const core = cloneFreeze({
    schemaVersion: NICOLE_REFERENCE_SCHEMA_VERSION,
    versionId,
    versionNumber,
    teacherId: 'nicole' as const,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    sourceMediaTimeUs: input.selectedTarget.mediaTimeUs,
    videoWidth: input.frame.videoWidth,
    videoHeight: input.frame.videoHeight,
    direction: Object.freeze({ x: dx / length, y: dy / length }),
    sourceSegmentLengthPx: length,
    label: 'Nicole-Referenzlinie' as const,
    ...(input.phaseBinding ? { phaseBinding: cloneFreeze(input.phaseBinding) } : {}),
    digestAlgorithm: NICOLE_REFERENCE_DIGEST_ALGORITHM,
  });
  return cloneFreeze({ ...core, versionDigest: sha256Canonical(versionCore(core)) });
}

function makeRecord(
  input: SaveNicoleReferenceLineInput,
  target: SkeletonTargetDefinition,
  existing: NicoleReferenceLineRecord | null,
  version: NicoleReferenceLineVersion,
  recordId: string,
): NicoleReferenceLineRecord {
  const core = cloneFreeze({
    schemaVersion: NICOLE_REFERENCE_SCHEMA_VERSION,
    recordId,
    videoSourceId: input.videoSourceId,
    targetId: target.id,
    targetKind: 'bone' as const,
    currentVersionId: version.versionId,
    versions: Object.freeze([...(existing?.versions ?? []), version]),
    digestAlgorithm: NICOLE_REFERENCE_DIGEST_ALGORITHM,
  });
  return cloneFreeze({ ...core, recordDigest: sha256Canonical(recordCore(core)) });
}

export function saveNicoleReferenceLine(input: SaveNicoleReferenceLineInput): NicoleReferenceLineRecord {
  const { selectedTarget, frame } = input;
  const target = getSkeletonTarget(selectedTarget.targetId);
  const packet = input.posePacket;
  if (
    !target
    || target.kind !== 'bone'
    || typeof input.videoSourceId !== 'string'
    || input.videoSourceId.length === 0
    || selectedTarget.kind !== 'bone'
    || selectedTarget.targetId !== target.id
    || selectedTarget.frameStatus !== 'exact_cache_frame'
    || selectedTarget.sourceId !== input.videoSourceId
    || selectedTarget.sourceId !== frame.sourceId
    || selectedTarget.streamEpoch !== frame.streamEpoch
    || selectedTarget.generation !== frame.generation
    || selectedTarget.mediaTimeUs !== frame.mediaTimeUs
    || !Number.isInteger(selectedTarget.mediaTimeUs)
    || selectedTarget.mediaTimeUs < 0
    || packet.resultKind !== 'pose'
    || packet.source !== 'frame_cache'
    || packet.sourceId !== frame.sourceId
    || packet.streamEpoch !== frame.streamEpoch
    || packet.generation !== frame.generation
    || packet.mediaTimeUs !== frame.mediaTimeUs
    || packet.videoWidth !== frame.videoWidth
    || packet.videoHeight !== frame.videoHeight
    || !isFinitePositive(frame.videoWidth)
    || !isFinitePositive(frame.videoHeight)
    || !Array.isArray(packet.landmarks)
    || packet.landmarks.length < 33
  ) throw new Error('Nicole reference requires the current exact bone frame.');

  const records = [...loadNicoleReferenceLinesForWrite(input.storage)];
  const existingIndex = records.findIndex(record => (
    record.videoSourceId === input.videoSourceId && record.targetId === target.id
  ));
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const createId = input.createId ?? (() => crypto.randomUUID());
  const version = makeVersion(input, target, (existing?.versions.length ?? 0) + 1, createId());
  const record = makeRecord(input, target, existing, version, existing?.recordId ?? createId());
  if (!nicoleReferenceRecordIsValid(record)) {
    throw new Error('Nicole reference record failed its storage contract.');
  }
  if (existingIndex >= 0) records[existingIndex] = record;
  else records.push(record);
  persistRecords(input.storage, records);
  return record;
}

export function getNicoleReferenceLine(
  storage: NicoleReferenceStorage,
  videoSourceId: string,
  targetId: SkeletonTargetId,
): NicoleReferenceLineRecord | null {
  return loadNicoleReferenceLines(storage).find(record => (
    record.videoSourceId === videoSourceId && record.targetId === targetId
  )) ?? null;
}

export function projectNicoleReferenceGuide(
  record: NicoleReferenceLineRecord | null,
): NicoleReferenceLineGuide | null {
  if (!record || !nicoleReferenceRecordIsValid(record)) return null;
  const version = record.versions.find(item => item.versionId === record.currentVersionId);
  if (!version) return null;
  const core = cloneFreeze({
    schemaVersion: NICOLE_REFERENCE_SCHEMA_VERSION,
    recordId: record.recordId,
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    videoSourceId: record.videoSourceId,
    targetId: record.targetId,
    targetKind: 'bone' as const,
    videoWidth: version.videoWidth,
    videoHeight: version.videoHeight,
    sourceMediaTimeUs: version.sourceMediaTimeUs,
    direction: Object.freeze({ ...version.direction }),
    label: version.label,
    teacherId: version.teacherId,
    versionDigest: version.versionDigest,
    digestAlgorithm: NICOLE_REFERENCE_DIGEST_ALGORITHM,
  });
  return cloneFreeze({ ...core, guideDigest: sha256Canonical(core) });
}

export function isNicoleReferenceGuideCurrent(
  guide: NicoleReferenceLineGuide | null | undefined,
  selectedTarget: SelectedSkeletonTarget | null | undefined,
  frame: NicoleReferenceFrameContext | null | undefined,
): guide is NicoleReferenceLineGuide {
  try {
    if (!guide || typeof guide !== 'object' || !selectedTarget || !frame) return false;
    if (
    guide.schemaVersion !== NICOLE_REFERENCE_SCHEMA_VERSION
    || typeof guide.recordId !== 'string' || guide.recordId.length === 0
    || typeof guide.versionId !== 'string' || guide.versionId.length === 0
    || !Number.isInteger(guide.versionNumber) || guide.versionNumber < 1
    || typeof guide.videoSourceId !== 'string' || guide.videoSourceId.length === 0
    || typeof guide.targetId !== 'string' || getSkeletonTarget(guide.targetId)?.kind !== 'bone'
    || guide.targetKind !== 'bone'
    || !isFinitePositive(guide.videoWidth) || !isFinitePositive(guide.videoHeight)
    || !Number.isInteger(guide.sourceMediaTimeUs) || guide.sourceMediaTimeUs < 0
    || !guide.direction || !Number.isFinite(guide.direction.x) || !Number.isFinite(guide.direction.y)
    || guide.label !== 'Nicole-Referenzlinie'
    || guide.teacherId !== 'nicole'
    || typeof guide.versionDigest !== 'string' || guide.versionDigest.length !== 64
    || guide.digestAlgorithm !== NICOLE_REFERENCE_DIGEST_ALGORITHM
    || typeof guide.guideDigest !== 'string' || guide.guideDigest.length !== 64
    ) return false;
    const magnitude = Math.hypot(guide.direction.x, guide.direction.y);
    const { guideDigest, ...guideCore } = guide;
    return guide.schemaVersion === NICOLE_REFERENCE_SCHEMA_VERSION
    && guide.targetKind === 'bone'
    && selectedTarget.kind === 'bone'
    && selectedTarget.frameStatus === 'exact_cache_frame'
    && guide.videoSourceId === selectedTarget.sourceId
    && guide.videoSourceId === frame.sourceId
    && guide.targetId === selectedTarget.targetId
    && selectedTarget.sourceId === frame.sourceId
    && selectedTarget.streamEpoch === frame.streamEpoch
    && selectedTarget.generation === frame.generation
    && selectedTarget.mediaTimeUs === frame.mediaTimeUs
    && guide.videoWidth === frame.videoWidth
    && guide.videoHeight === frame.videoHeight
    && Number.isFinite(guide.direction.x)
    && Number.isFinite(guide.direction.y)
    && Math.abs(magnitude - 1) <= 1e-9
      && guideDigest === sha256Canonical(guideCore);
  } catch {
    return false;
  }
}
