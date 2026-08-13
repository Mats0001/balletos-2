import { describe, expect, it } from 'vitest';
import type { PoseLandmark } from '../services/realMediaPipePose';
import {
  detectTechnicalMotionPhases,
  type TechnicalMotionSample,
} from '../services/technicalMotionPhaseEngine';

function pose(): PoseLandmark[] {
  const result = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.45, z: 0, visibility: 0.98 }));
  const set = (index: number, x: number, y: number) => { result[index] = { x, y, z: 0, visibility: 0.98 }; };
  set(0, 0.5, 0.08);
  set(11, 0.36, 0.25); set(12, 0.64, 0.25);
  set(23, 0.42, 0.52); set(24, 0.58, 0.52);
  set(25, 0.42, 0.68); set(26, 0.58, 0.68);
  set(27, 0.42, 0.84); set(28, 0.58, 0.84);
  set(31, 0.37, 0.91); set(32, 0.63, 0.91);
  return result;
}

function cycleShape(): number[] {
  return [
    ...Array(8).fill(0),
    ...Array.from({ length: 10 }, (_, index) => (index + 1) / 10),
    ...Array(5).fill(1),
    ...Array.from({ length: 10 }, (_, index) => 1 - (index + 1) / 10),
    ...Array(8).fill(0),
  ];
}

function samplesFor(
  movement: 'passe' | 'jete' | 'changement',
  cycles = 1,
): TechnicalMotionSample[] {
  const shape = Array.from({ length: cycles }, () => cycleShape()).flat();
  return shape.map((progress, index) => {
    const landmarks = pose();
    let torsoY = 0.385;
    if (movement === 'passe') landmarks[32].y -= progress * 0.26;
    if (movement === 'jete') landmarks[32].x += progress * 0.24;
    if (movement === 'changement') {
      landmarks.forEach(point => { point.y -= progress * 0.1; });
      torsoY -= progress * 0.1;
    }
    return {
      timeMs: index * 33.333,
      landmarks,
      torsoCenter: { x: 0.5, y: torsoY },
      bboxHeight: 0.83,
      perspective: 'FRONTAL' as const,
    };
  });
}

describe('technical Dryad-informed motion phases', () => {
  it.each([
    ['passe', ['preparation', 'lift', 'placement', 'lower', 'finish']],
    ['jete', ['preparation', 'brush', 'release', 'return', 'finish']],
    ['changement', ['preparation', 'takeoff', 'flight', 'landing', 'finish']],
  ] as const)('detects five ordered %s phases from observed motion', (movement, expected) => {
    const result = detectTechnicalMotionPhases(movement, samplesFor(movement));

    expect(result?.boundaries.map(boundary => boundary.id)).toEqual(expected);
    expect(result?.cycleCount).toBe(1);
    expect(result?.confidence).toBeGreaterThan(0.45);
    expect(result?.timingPriorConfidence).toBeGreaterThan(0.35);
    expect(result?.templateSourceId).toContain('dryad');
    expect(result?.boundaries.every(boundary => boundary.startIndex <= boundary.endIndex)).toBe(true);
  });

  it('keeps two restless Passé cycles separate without adding threshold-jitter cycles', () => {
    const samples = samplesFor('passe', 2).map((sample, index) => {
      const landmarks = sample.landmarks.map(point => ({ ...point }));
      if (index % cycleShape().length >= 35 && index % cycleShape().length <= 37) {
        landmarks[32].y -= index % 2 === 0 ? 0.008 : 0.004;
      }
      return { ...sample, landmarks };
    });
    const result = detectTechnicalMotionPhases('passe', samples);

    expect(result?.cycleCount).toBe(2);
    expect(result?.boundaries).toHaveLength(10);
    expect(result?.workingSide).toBe('right');
  });

  it('classifies a frontal Jeté path without turning the Dryad prior into a correctness claim', () => {
    const result = detectTechnicalMotionPhases('jete', samplesFor('jete'));

    expect(result).toMatchObject({
      workingSide: 'right',
      direction: 'a_la_seconde',
      exerciseId: 'jete',
    });
    expect(result?.directionConfidence).toBeGreaterThan(0.7);
  });

  it('fails closed for incomplete, invisible or motionless evidence', () => {
    const incomplete = samplesFor('passe').slice(0, 22);
    const invisible = samplesFor('jete').map(sample => ({
      ...sample,
      landmarks: sample.landmarks.map((point, index) => index === 32 ? { ...point, visibility: 0.1 } : point),
    }));
    const motionless = samplesFor('changement').map(sample => ({
      ...sample,
      torsoCenter: { x: 0.5, y: 0.385 },
    }));

    expect(detectTechnicalMotionPhases('passe', incomplete)).toBeNull();
    expect(detectTechnicalMotionPhases('jete', invisible)).toBeNull();
    expect(detectTechnicalMotionPhases('changement', motionless)).toBeNull();
  });
});
