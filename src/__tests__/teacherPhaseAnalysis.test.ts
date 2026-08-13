import { describe, expect, it } from 'vitest';
import type { FrameEntry } from '../services/frameInterpolator';
import type { PoseLandmark } from '../services/realMediaPipePose';
import {
  analyzeTeacherPhases,
  calculateFrameImageQuality,
  findTeacherPhaseAtTime,
  phaseToOverlayPacket,
  summarizePhaseRegionStates,
} from '../services/teacherPhaseAnalysis';
import { heuristicBaseState, heuristicDash, TEACHER_REGION_KEYS } from '../types/teacherHeuristic';

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
    timeMs: index * 33.333,
    resultKind: 'pose' as const,
    landmarks: poseForKneeAngle(angle),
    imageQuality: { sharpnessScore: 0.42, backgroundMotionScore: index === 0 ? null : 0.02 },
  }));
}

describe('teacher phase-based post analysis', () => {
  it('gates a complete recording and produces all five ordered Plié phases', () => {
    const result = analyzeTeacherPhases({
      frames: fullCycleFrames(),
      videoWidth: 960,
      videoHeight: 1280,
      exerciseLabel: 'Plié in der 1. Position',
      levelLabel: 'MINIS',
    });

    expect(result.gate.status).toBe('ready');
    expect(result.phases.map(phase => phase.id)).toEqual(['setup', 'descent', 'bottom', 'ascent', 'finish']);
    expect(result.phases.every(phase => phase.startMs <= phase.endMs)).toBe(true);
    expect(findTeacherPhaseAtTime(result, result.phases[2].representativeTimeMs)?.id).toBe('bottom');
  });

  it('keeps colour and evidence confidence orthogonal in every phase region', () => {
    const result = analyzeTeacherPhases({
      frames: fullCycleFrames(),
      videoWidth: 960,
      videoHeight: 1280,
      exerciseLabel: 'Plié',
      levelLabel: 'Basis',
    });
    const bottom = result.phases.find(phase => phase.id === 'bottom')!;
    const packet = phaseToOverlayPacket(bottom, 2.5, 91);

    for (const key of TEACHER_REGION_KEYS) {
      expect(heuristicBaseState(packet[key])).not.toBeNull();
      expect(heuristicDash(packet[key]).length).toBeGreaterThanOrEqual(0);
    }
    expect(packet.framePtsSeconds).toBe(2.5);
    expect(packet.streamEpoch).toBe(91);
  });

  it('keeps the nearest phase colour and expresses temporal disagreement only as dashes', () => {
    const inside = summarizePhaseRegionStates([
      'heuristic_match', 'heuristic_match', 'heuristic_match',
    ]);
    const outside = summarizePhaseRegionStates([
      'heuristic_strong_attention', 'heuristic_strong_attention', 'heuristic_strong_attention',
    ]);
    const nearestGreen = summarizePhaseRegionStates([
      'heuristic_match', 'heuristic_match', 'heuristic_attention',
    ]);
    const nearestYellow = summarizePhaseRegionStates([
      'heuristic_attention', 'heuristic_attention', 'heuristic_strong_attention',
    ]);
    const nearestRed = summarizePhaseRegionStates([
      'heuristic_strong_attention', 'heuristic_strong_attention', 'heuristic_attention',
    ]);
    const tie = summarizePhaseRegionStates([
      'heuristic_match', 'heuristic_strong_attention',
    ]);
    const uncertainOutside = summarizePhaseRegionStates([
      'heuristic_strong_attention_uncertain',
      'heuristic_strong_attention_uncertain',
      'heuristic_strong_attention_uncertain',
    ]);

    expect(inside).toMatchObject({ state: 'heuristic_match', corridorResult: 'inside' });
    expect(outside).toMatchObject({ state: 'heuristic_strong_attention', corridorResult: 'outside' });
    expect(nearestGreen).toMatchObject({ state: 'heuristic_match_uncertain', corridorResult: 'inside' });
    expect(nearestYellow).toMatchObject({ state: 'heuristic_attention_uncertain', corridorResult: 'overlap' });
    expect(nearestRed).toMatchObject({ state: 'heuristic_strong_attention_uncertain', corridorResult: 'outside' });
    expect(tie).toMatchObject({ state: 'heuristic_attention_uncertain', corridorResult: 'overlap' });
    expect(uncertainOutside).toMatchObject({
      state: 'heuristic_strong_attention_uncertain',
      corridorResult: 'outside',
    });
  });

  it('ignores blocked samples as colour votes but keeps their evidence gap visible', () => {
    const result = summarizePhaseRegionStates([
      'heuristic_match', 'heuristic_match', 'blocked',
    ]);

    expect(result).toMatchObject({
      state: 'heuristic_match_uncertain',
      corridorResult: 'inside',
      sampleCount: 2,
    });
  });

  it('returns Aufnahme korrigieren instead of phase colours when hard recording gates fail', () => {
    const frames = fullCycleFrames().map((frame, index) => ({
      ...frame,
      imageQuality: { sharpnessScore: 0.01, backgroundMotionScore: index === 0 ? null : 0.4 },
      landmarks: frame.landmarks!.map((landmark, landmarkIndex) => (
        [27, 28, 31, 32].includes(landmarkIndex) ? { ...landmark, visibility: 0.05 } : landmark
      )),
    }));
    const result = analyzeTeacherPhases({
      frames,
      videoWidth: 960,
      videoHeight: 1280,
      exerciseLabel: '',
      levelLabel: '',
    });

    expect(result.gate.status).toBe('needs_correction');
    expect(result.phases).toEqual([]);
    expect(result.gate.correctiveActions).toEqual(expect.arrayContaining([
      'Plié und Stufe ausgewählt',
      'Füße und relevante Gelenke sichtbar',
      'Ausreichende Bildschärfe',
      'Kamera stabil',
    ]));
  });
});

describe('frame image quality', () => {
  it('distinguishes a flat image from a high-edge image and tracks border motion', () => {
    const width = 8;
    const height = 8;
    const flat = new Uint8ClampedArray(width * height * 4).fill(128);
    for (let index = 3; index < flat.length; index += 4) flat[index] = 255;
    const checker = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = (x + y) % 2 === 0 ? 0 : 255;
        const offset = (y * width + x) * 4;
        checker.set([value, value, value, 255], offset);
      }
    }
    const flatResult = calculateFrameImageQuality(flat, width, height, null);
    const sharpResult = calculateFrameImageQuality(checker, width, height, flatResult.luma);

    expect(sharpResult.quality.sharpnessScore).toBeGreaterThan(flatResult.quality.sharpnessScore);
    expect(sharpResult.quality.backgroundMotionScore).toBeGreaterThan(0.2);
  });
});
