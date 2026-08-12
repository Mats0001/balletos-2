import { describe, expect, it } from 'vitest';
import { TeacherHeuristicEngine } from '../services/teacherHeuristicEngine';
import {
  VaganovaFullAnalysis,
  VaganovaMeasurement,
} from '../services/vaganovaAngleCalculator';
import { vaganova3DKinematics } from '../services/vaganova3DKinematics';
import { PoseLandmark } from '../services/realMediaPipePose';

function measurement(value: number, confidence = 0.9): VaganovaMeasurement {
  return {
    value,
    confidence,
    unit: 'deg',
    label: 'test',
    measurement_class: 'vaganova_relation',
  };
}

function analysis(overrides: Partial<VaganovaFullAnalysis> = {}): VaganovaFullAnalysis {
  return {
    knieFlexionL: null,
    knieFlexionR: null,
    valgusDriftL: null,
    valgusDriftR: null,
    turnoutL: null,
    turnoutR: null,
    spineTilt: measurement(1),
    epaulement: null,
    portDeBrasL: null,
    portDeBrasR: null,
    pelvicTilt: measurement(1),
    shoulderSymmetry: measurement(1),
    shoulderElevationL: null,
    shoulderElevationR: null,
    armLineQualityL: null,
    armLineQualityR: null,
    headTilt: null,
    plumbDeviation: null,
    ...overrides,
  };
}

function landmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: 0.2 + (index % 6) * 0.1,
    y: 0.15 + Math.floor(index / 6) * 0.12,
    z: 0,
    visibility: 0.95,
  }));
}

describe('TeacherHeuristicEngine evidence gates', () => {
  const engine = new TeacherHeuristicEngine();
  const skeleton = vaganova3DKinematics.solve(landmarks(), null, 960, 1280);

  it('requires spine, shoulder and pelvis evidence for a torso color', () => {
    const complete = engine.compute(analysis(), skeleton, 1, 1000);
    const missingShoulder = engine.compute(
      analysis({ shoulderSymmetry: null }),
      skeleton,
      1,
      1000,
    );

    expect(complete.torsoAlignment).toBe('heuristic_match');
    expect(missingShoulder.spine).toBe('heuristic_match');
    expect(missingShoulder.pelvis).toBe('heuristic_match');
    expect(missingShoulder.shoulder).toBe('blocked');
    expect(missingShoulder.torsoAlignment).toBe('blocked');
  });

  it.each([
    ['NaN value', measurement(Number.NaN)],
    ['infinite value', measurement(Number.POSITIVE_INFINITY)],
    ['NaN confidence', measurement(1, Number.NaN)],
    ['confidence above one', measurement(1, 1.1)],
    ['negative confidence', measurement(1, -0.1)],
  ])('blocks invalid numeric evidence: %s', (_label, invalid) => {
    const packet = engine.compute(
      analysis({ spineTilt: invalid }),
      skeleton,
      1,
      1000,
    );

    expect(packet.spine).toBe('blocked');
    expect(packet.torsoAlignment).toBe('blocked');
  });

  it('keeps foot and center-of-gravity proxies neutral without their required context', () => {
    const packet = engine.compute(analysis(), skeleton, 1, 1000);

    expect(packet.footL).toBe('blocked');
    expect(packet.footR).toBe('blocked');
    expect(packet.cog).toBe('blocked');
  });
});
