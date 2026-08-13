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

  it('keeps variable-amplitude repetitions separate and does not promote threshold jitter', () => {
    const amplitudes = [0.62, 1, 0.74] as const;
    const base = samplesFor('passe', amplitudes.length);
    const samples = base.map((sample, index) => {
      const landmarks = sample.landmarks.map(point => ({ ...point }));
      const cycleIndex = Math.floor(index / cycleShape().length);
      const progress = cycleShape()[index % cycleShape().length];
      landmarks[32].y = 0.91 - progress * 0.26 * amplitudes[cycleIndex];
      if (progress === 0 && index % 3 === 0) landmarks[32].y -= 0.004;
      return { ...sample, landmarks };
    });

    const result = detectTechnicalMotionPhases('passe', samples);

    expect(result?.cycleCount).toBe(3);
    expect(result?.boundaries).toHaveLength(15);
    expect(result?.boundaries.map(boundary => boundary.cycleIndex)).toEqual([
      0, 0, 0, 0, 0,
      1, 1, 1, 1, 1,
      2, 2, 2, 2, 2,
    ]);
  });

  it('interpolates at most two weak foot frames and lowers only affected phase evidence', () => {
    const clean = detectTechnicalMotionPhases('passe', samplesFor('passe'));
    const samples = samplesFor('passe').map((sample, index) => ({
      ...sample,
      landmarks: sample.landmarks.map((point, landmarkIndex) => (
        landmarkIndex === 32 && (index === 13 || index === 14)
          ? { ...point, visibility: 0.1 }
          : point
      )),
    }));

    const result = detectTechnicalMotionPhases('passe', samples);

    expect(result?.cycleCount).toBe(1);
    expect(result?.boundaries).toHaveLength(5);
    const affected = result!.boundaries.find(boundary => boundary.evidenceCoverage < 1);
    const cleanCounterpart = clean!.boundaries.find(boundary => boundary.id === affected?.id);
    expect(affected).toBeDefined();
    expect(affected!.confidence).toBeLessThan(cleanCounterpart!.confidence);
  });

  it('uses long capture interruptions as cycle boundaries instead of bridging them', () => {
    const cycleLength = cycleShape().length;
    const samples = samplesFor('passe', 2).map((sample, index) => ({
      ...sample,
      timeMs: sample.timeMs + (index >= cycleLength ? 500 : 0),
    }));

    const result = detectTechnicalMotionPhases('passe', samples);

    expect(result?.cycleCount).toBe(2);
    expect(result?.boundaries).toHaveLength(10);
    expect(result?.boundaries[4].endIndex).toBeLessThan(cycleLength);
    expect(result?.boundaries[5].startIndex).toBeGreaterThanOrEqual(cycleLength);
  });

  it('detects the left working side without confusing stationary-foot noise for a cycle', () => {
    const shape = cycleShape();
    const samples = samplesFor('passe').map((sample, index) => {
      const landmarks = sample.landmarks.map(point => ({ ...point }));
      landmarks[32].y = 0.91 + (index % 2 ? 0.001 : 0);
      landmarks[31].y = 0.91 - shape[index] * 0.26;
      return { ...sample, landmarks };
    });

    const result = detectTechnicalMotionPhases('passe', samples);

    expect(result?.workingSide).toBe('left');
    expect(result?.cycleCount).toBe(1);
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

  it('uses a cycle consensus for Jeté direction and reports contradictory cycles as undetermined', () => {
    const cycleLength = cycleShape().length;
    const samples = samplesFor('jete', 2).map((sample, index) => {
      const landmarks = sample.landmarks.map(point => ({ ...point }));
      if (index >= cycleLength) {
        const progress = cycleShape()[index - cycleLength];
        landmarks[32].x = 0.63 - progress * 0.24;
      }
      return { ...sample, landmarks, perspective: 'PROFILE_RIGHT' as const };
    });

    const result = detectTechnicalMotionPhases('jete', samples);

    expect(result?.cycleCount).toBe(2);
    expect(result?.direction).toBe('undetermined');
    expect(result?.directionConfidence).toBeLessThan(0.3);
  });

  it('rejects non-monotonic frame clocks instead of deriving unstable phase order', () => {
    const samples = samplesFor('jete').map((sample, index) => (
      index === 20 ? { ...sample, timeMs: samplesFor('jete')[19].timeMs } : sample
    ));

    expect(detectTechnicalMotionPhases('jete', samples)).toBeNull();
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
