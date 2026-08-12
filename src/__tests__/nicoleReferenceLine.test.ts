import { describe, expect, it } from 'vitest';
import {
  getNicoleReferenceLine,
  isNicoleReferenceGuideCurrent,
  loadNicoleReferenceLines,
  projectNicoleReferenceGuide,
  saveNicoleReferenceLine,
} from '../services/nicoleReferenceLine';
import { getSkeletonTarget } from '../services/skeletonTargetRegistry';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';

const point = (x: number, y: number) => ({ x, y, vis: 1 });
const SKELETON = {
  head: point(500, 100), neck: point(500, 180), sternum: point(500, 300), navel: point(500, 430), pelvisCenter: point(500, 520),
  shoulderL: point(400, 200), shoulderR: point(600, 200), elbowL: point(320, 300), elbowR: point(680, 300),
  wristL: point(250, 380), wristR: point(750, 380), pelvisL: point(450, 520), pelvisR: point(550, 520),
  kneeL: point(450, 700), kneeR: point(550, 700), ankleL: point(440, 900), ankleR: point(560, 900),
  footL: point(400, 930), footR: point(600, 930),
} satisfies ReconstructedSkeleton;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

const selected = {
  targetId: 'bone.forearm_l' as const,
  kind: 'bone' as const,
  anchorNormalized: { x: 0.3, y: 0.3 },
  sourceId: 'clip-a',
  streamEpoch: 4,
  generation: 2,
  mediaTimeUs: 2_500_000,
  frameStatus: 'exact_cache_frame' as const,
};

const frame = {
  sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs: 2_500_000,
  videoWidth: 1000, videoHeight: 1000,
};
const poseLandmarks = Array.from({ length: 33 }, (_, index) => ({
  x: 0.3 + index * 0.01,
  y: 0.2 + index * 0.008,
  z: 0,
  visibility: 0.95,
}));
const posePacket = {
  streamEpoch: 4, frameSeq: 75, mediaTimeUs: 2_500_000, inferenceStartedAtMs: 1, inferenceEndedAtMs: 2,
  resultKind: 'pose' as const, landmarks: poseLandmarks, avgVisibility: 0.95, source: 'frame_cache' as const,
  generation: 2, sourceId: 'clip-a', videoWidth: 1000, videoHeight: 1000,
};

describe('Nicole reference line contract', () => {
  it('appends immutable versions instead of overwriting the teacher reference', () => {
    const storage = memoryStorage();
    let id = 0;
    const createId = () => `id-${++id}`;
    const first = saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame, createId, now: () => new Date('2026-08-12T10:00:00Z') });
    const second = saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame, createId, now: () => new Date('2026-08-12T10:01:00Z') });

    expect(first.versions).toHaveLength(1);
    expect(second.versions).toHaveLength(2);
    expect(second.versions[0]).toEqual(first.versions[0]);
    expect(second.versions[1].versionNumber).toBe(2);
    expect(second.currentVersionId).toBe(second.versions[1].versionId);
    expect(getNicoleReferenceLine(storage, 'clip-a', selected.targetId)).toEqual(second);
  });

  it('rejects joints, stale identity, low-visibility geometry and cross-source writes', () => {
    const storage = memoryStorage();
    const trySave = (overrides: Partial<Parameters<typeof saveNicoleReferenceLine>[0]>) => () => saveNicoleReferenceLine({
      storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame,
      createId: () => 'id', now: () => new Date('2026-08-12T10:00:00Z'), ...overrides,
    });
    expect(trySave({ selectedTarget: { ...selected, frameStatus: 'display_frame' } })).toThrow();
    expect(trySave({ videoSourceId: 'clip-b' })).toThrow();
    expect(trySave({ posePacket: { ...posePacket, source: 'live_inference' } })).toThrow();
    expect(trySave({ posePacket: { ...posePacket, mediaTimeUs: 2_400_000 } })).toThrow();
    expect(trySave({ selectedTarget: { ...selected, targetId: 'joint.elbow_l', kind: 'joint' } })).toThrow();
    expect(trySave({ posePacket: { ...posePacket, landmarks: [] } })).toThrow();
    const lowVisibility = poseLandmarks.map((point, index) => index === 15 ? { ...point, visibility: 0.1 } : point);
    expect(trySave({ posePacket: { ...posePacket, landmarks: lowVisibility } })).toThrow();
    const outsideFrame = poseLandmarks.map((point, index) => index === 15 ? { ...point, x: 99, y: -99 } : point);
    expect(trySave({ posePacket: { ...posePacket, landmarks: outsideFrame } })).toThrow();
    expect(loadNicoleReferenceLines(storage)).toEqual([]);
  });

  it('never treats a storage read failure as an empty history during save', () => {
    let writes = 0;
    const storage = {
      getItem: () => { throw new Error('read failed'); },
      setItem: () => { writes += 1; },
    };
    expect(() => saveNicoleReferenceLine({
      storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame,
      createId: () => 'id', now: () => new Date('2026-08-12T10:00:00Z'),
    })).toThrow('could not be read');
    expect(writes).toBe(0);
  });

  it('fails closed on corrupt persisted data and quarantines it', () => {
    const storage = memoryStorage();
    storage.setItem('balletos_nicole_reference_lines_v1', '{bad-json');
    expect(loadNicoleReferenceLines(storage)).toEqual([]);
    expect(storage.values.get('balletos_nicole_reference_lines_v1_quarantine')).toBe('{bad-json');
  });

  it('rejects duplicate records, duplicate version ids, invalid source/time and colliding ids before persistence', () => {
    const storage = memoryStorage();
    const ids = ['version-1', 'record-1', 'version-1'];
    const createId = () => ids.shift() ?? 'version-1';
    saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame, createId, now: () => new Date('2026-08-12T10:00:00Z') });
    const before = storage.values.get('balletos_nicole_reference_lines_v1');
    expect(() => saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame, createId, now: () => new Date('2026-08-12T10:01:00Z') })).toThrow();
    expect(storage.values.get('balletos_nicole_reference_lines_v1')).toBe(before);
    expect(() => saveNicoleReferenceLine({ storage, videoSourceId: '', selectedTarget: { ...selected, sourceId: '' }, posePacket: { ...posePacket, sourceId: '' }, frame: { ...frame, sourceId: '' } })).toThrow();
    expect(() => saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: { ...selected, mediaTimeUs: -1 }, posePacket: { ...posePacket, mediaTimeUs: -1 }, frame: { ...frame, mediaTimeUs: -1 } })).toThrow();

    const parsed = JSON.parse(before!);
    parsed.records.push(parsed.records[0]);
    storage.setItem('balletos_nicole_reference_lines_v1', JSON.stringify(parsed));
    expect(loadNicoleReferenceLines(storage)).toEqual([]);
  });

  it('projects only a same-source, same-bone, exact current-frame guide', () => {
    const storage = memoryStorage();
    const record = saveNicoleReferenceLine({ storage, videoSourceId: 'clip-a', selectedTarget: selected, posePacket, frame, createId: (() => { let id = 0; return () => `id-${++id}`; })(), now: () => new Date('2026-08-12T10:00:00Z') });
    const guide = projectNicoleReferenceGuide(record);
    expect(guide).not.toBeNull();
    expect(isNicoleReferenceGuideCurrent(guide, selected, frame)).toBe(true);
    expect(() => isNicoleReferenceGuideCurrent({ schemaVersion: 1 } as never, selected, frame)).not.toThrow();
    expect(isNicoleReferenceGuideCurrent({ schemaVersion: 1 } as never, selected, frame)).toBe(false);
    expect(isNicoleReferenceGuideCurrent({ ...guide!, direction: null } as never, selected, frame)).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide && { ...guide, direction: { x: 0, y: 1 } }, selected, frame)).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide, { ...selected, targetId: 'bone.forearm_r' }, frame)).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide, { ...selected, frameStatus: 'display_frame' }, frame)).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide, selected, { ...frame, sourceId: 'clip-b' })).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide, selected, { ...frame, mediaTimeUs: 2_600_000 })).toBe(false);
    expect(isNicoleReferenceGuideCurrent(guide, selected, { ...frame, videoWidth: 999 })).toBe(false);
  });
});
