import { describe, expect, it } from 'vitest';
import type { FrameEntry } from '../services/frameInterpolator';
import { compareNicolePhaseReferences } from '../services/nicolePhaseReferenceComparison';
import { saveNicoleReferenceLine } from '../services/nicoleReferenceLine';
import type { PoseLandmark } from '../services/realMediaPipePose';
import { analyzeTeacherPhases } from '../services/teacherPhaseAnalysis';

function poseForKneeAngle(angleDeg: number): PoseLandmark[] {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.45, z: 0, visibility: 0.97,
  }));
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0, visibility: 0.97 };
  };
  set(0, 0.5, 0.08);
  set(11, 0.35, 0.24); set(12, 0.65, 0.24);
  set(13, 0.27, 0.38); set(14, 0.73, 0.38);
  set(15, 0.2, 0.52); set(16, 0.8, 0.52);
  set(23, 0.4, 0.5); set(24, 0.6, 0.5);
  set(25, 0.4, 0.68); set(26, 0.6, 0.68);
  const bend = (180 - angleDeg) * Math.PI / 180;
  const dx = Math.sin(bend) * 0.18;
  const dy = Math.cos(bend) * 0.18;
  set(27, 0.4 - dx, 0.68 + dy); set(28, 0.6 + dx, 0.68 + dy);
  set(29, 0.36 - dx, 0.9); set(30, 0.64 + dx, 0.9);
  set(31, 0.31 - dx, 0.92); set(32, 0.69 + dx, 0.92);
  return landmarks;
}

function fullCycleFrames(): FrameEntry[] {
  const angles = [
    ...Array(8).fill(170),
    ...Array.from({ length: 10 }, (_, index) => 164 - index * 6),
    ...Array(5).fill(104),
    ...Array.from({ length: 10 }, (_, index) => 110 + index * 6),
    ...Array(8).fill(170),
  ];
  return angles.map((angle, index) => ({
    timeMs: index * 40,
    resultKind: 'pose' as const,
    landmarks: poseForKneeAngle(angle),
    imageQuality: { sharpnessScore: 0.42, backgroundMotionScore: index === 0 ? null : 0.02 },
  }));
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function fixture(phaseId: 'setup' | 'bottom' = 'bottom') {
  const frames = fullCycleFrames();
  const analysis = analyzeTeacherPhases({
    frames,
    videoWidth: 960,
    videoHeight: 1280,
    exerciseLabel: 'Plié in der 1. Position',
    levelLabel: 'MINIS',
  });
  const bottom = analysis.phases.find(phase => phase.id === 'bottom')!;
  const frame = frames.reduce((nearest, candidate) => (
    Math.abs(candidate.timeMs - bottom.representativeTimeMs) < Math.abs(nearest.timeMs - bottom.representativeTimeMs)
      ? candidate : nearest
  ));
  const mediaTimeUs = frame.timeMs * 1000;
  const selectedTarget = {
    targetId: 'bone.shin_l' as const,
    kind: 'bone' as const,
    anchorNormalized: { x: 0.4, y: 0.8 },
    sourceId: 'clip-nicole',
    streamEpoch: 4,
    generation: 2,
    mediaTimeUs,
    frameStatus: 'exact_cache_frame' as const,
  };
  const packet = {
    streamEpoch: 4, frameSeq: 75, mediaTimeUs, inferenceStartedAtMs: 1, inferenceEndedAtMs: 2,
    resultKind: 'pose' as const, landmarks: frame.landmarks!, avgVisibility: 0.95, source: 'frame_cache' as const,
    generation: 2, sourceId: 'clip-nicole', videoWidth: 960, videoHeight: 1280,
  };
  const storage = memoryStorage();
  const record = saveNicoleReferenceLine({
    storage,
    videoSourceId: 'clip-nicole',
    selectedTarget,
    posePacket: packet,
    frame: {
      sourceId: 'clip-nicole', streamEpoch: 4, generation: 2, mediaTimeUs,
      videoWidth: 960, videoHeight: 1280,
    },
    phaseBinding: {
      schemaVersion: 1,
      exerciseId: 'plie',
      phaseId,
      perspectivePlane: 'frontal',
      levelLabel: 'MINIS',
      policyVersion: analysis.policyVersion,
      reviewState: 'nicole_approved',
    },
    createId: (() => { let index = 0; return () => `reference-${++index}`; })(),
    now: () => new Date('2026-08-13T10:00:00Z'),
  });
  return { analysis, frames, record };
}

describe('Nicole phase reference comparison', () => {
  it('compares only the current phase-bound version within the exact same video', () => {
    const { analysis, frames, record } = fixture();
    const result = compareNicolePhaseReferences({
      analysis,
      frames,
      videoSourceId: 'clip-nicole',
      videoWidth: 960,
      videoHeight: 1280,
      records: [record],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'ready',
      sourceScope: 'same_video',
      phaseId: 'bottom',
      targetId: 'bone.shin_l',
      versionNumber: 1,
      evidenceStyle: 'solid',
    });
    expect(result[0].medianAxisDeltaDeg).toBeGreaterThanOrEqual(0);
    expect(result[0].medianAxisDeltaDeg).toBeLessThan(20);
    expect(result[0].usableSampleCount).toBe(result[0].phaseSampleCount);
  });

  it('never imports a same-target line across video, policy, level or phase-binding gaps', () => {
    const { analysis, frames, record } = fixture();
    const compare = (records: typeof record[]) => compareNicolePhaseReferences({
      analysis, frames, videoSourceId: 'clip-student', videoWidth: 960, videoHeight: 1280, records,
    });
    expect(compare([record])).toEqual([]);

    const misbound = fixture('setup');
    expect(compareNicolePhaseReferences({
      analysis: misbound.analysis,
      frames: misbound.frames,
      videoSourceId: 'clip-nicole',
      videoWidth: 960,
      videoHeight: 1280,
      records: [misbound.record],
    })).toEqual([]);

    const current = record.versions[0];
    const unbound = { ...current, phaseBinding: undefined };
    // Direct object tampering invalidates both version and record digests; it
    // must be ignored rather than interpreted as a Nicole standard.
    expect(compareNicolePhaseReferences({
      analysis, frames, videoSourceId: 'clip-nicole', videoWidth: 960, videoHeight: 1280,
      records: [{ ...record, versions: [unbound] }],
    })).toEqual([]);
  });

  it('returns a dashed unavailable comparison when target evidence is missing in the phase', () => {
    const { analysis, frames, record } = fixture();
    const bottom = analysis.phases.find(phase => phase.id === 'bottom')!;
    const missing = frames.map(frame => (
      frame.timeMs >= bottom.startMs && frame.timeMs <= bottom.endMs
        ? {
          ...frame,
          landmarks: frame.landmarks!.map((landmark, index) => (
            index === 27 ? { ...landmark, visibility: 0.05 } : landmark
          )),
        }
        : frame
    ));
    const result = compareNicolePhaseReferences({
      analysis, frames: missing, videoSourceId: 'clip-nicole', videoWidth: 960, videoHeight: 1280,
      records: [record],
    });

    expect(result[0]).toMatchObject({
      status: 'insufficient_evidence',
      evidenceStyle: 'dashed',
      usableSampleCount: 0,
      medianAxisDeltaDeg: null,
    });
  });
});
