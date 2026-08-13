import { describe, expect, it } from 'vitest';
import { TeacherHeuristicContext, TeacherHeuristicEngine } from '../services/teacherHeuristicEngine';
import {
  UnavailableVaganovaMeasurement,
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

function observation(value: number): VaganovaMeasurement {
  return {
    value,
    confidence: 0.95,
    unit: 'deg',
    label: 'leg shadow metric',
    measurement_class: 'research_observation',
  };
}

function unavailableKneeAxis(): UnavailableVaganovaMeasurement {
  return {
    confidence: 0.95,
    label: 'projected knee axis (unscored)',
    measurement_class: 'not_measurable',
    not_measurable_reason: 'missing reference anchor',
  };
}

function armMeasurement(
  value: number,
  status: 'CORRECT' | 'WARNING' | 'ERROR',
): VaganovaMeasurement {
  return {
    value,
    confidence: 0.95,
    unit: 'deg',
    label: 'actual elbow angle',
    measurement_class: 'vaganova_relation',
    status,
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

function coachingSkeleton() {
  const p = (x: number, y: number) => ({ x, y, vis: 0.95 });
  return {
    head: p(500, 120), neck: p(500, 260), sternum: p(500, 360),
    navel: p(500, 470), pelvisCenter: p(500, 550),
    shoulderL: p(400, 300), shoulderR: p(600, 300),
    elbowL: p(300, 350), elbowR: p(700, 350),
    wristL: p(200, 300), wristR: p(800, 300),
    pelvisL: p(450, 550), pelvisR: p(550, 550),
    kneeL: p(380, 700), kneeR: p(620, 700),
    ankleL: p(350, 850), ankleR: p(650, 850),
    footL: p(380, 850), footR: p(620, 850),
  };
}

const frontalPlieContext: TeacherHeuristicContext = {
  motion: {
    detectedPerspective: 'FRONTAL',
    confidence: 95,
    isPlie: true,
    isArabesque: false,
  },
  cogX: 500,
};

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
    expect(missingShoulder.shoulder).toBe('heuristic_review');
    expect(missingShoulder.torsoAlignment).toBe('heuristic_review');
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

    expect(packet.spine).toBe('heuristic_review');
    expect(packet.torsoAlignment).toBe('heuristic_review');
  });

  it('keeps foot and center-of-gravity proxies neutral without their required context', () => {
    const packet = engine.compute(analysis(), skeleton, 1, 1000);

    expect(packet.footL).toBe('heuristic_review');
    expect(packet.footR).toBe('heuristic_review');
    expect(packet.cog).toBe('heuristic_review');
  });

  it.each([24, -24])(
    'keeps research observations and unavailable knee-axis evidence out of the traffic light (%s°)',
    kneeFlexion => {
      const packet = engine.compute(analysis({
        knieFlexionL: observation(kneeFlexion),
        knieFlexionR: observation(kneeFlexion),
        valgusDriftL: unavailableKneeAxis(),
        valgusDriftR: unavailableKneeAxis(),
      }), skeleton, 1, 1000);

      expect(packet.legL).toBe('heuristic_review');
      expect(packet.legR).toBe('heuristic_review');
    },
  );

  it.each([
    ['candidate-correct second-position angle', 160, 'CORRECT'],
    ['candidate-warning second-position angle', 140, 'WARNING'],
    ['candidate-error angle', 120, 'ERROR'],
    ['near-zero angle that the former resolver inverted to green', 8, 'ERROR'],
  ] as const)(
    'keeps arm traffic colors neutral without a verified position and view: %s',
    (_label, value, status) => {
      const packet = engine.compute(analysis({
        armLineQualityL: armMeasurement(value, status),
        armLineQualityR: armMeasurement(value, status),
      }), skeleton, 1, 1000);

      expect(packet.armL).toBe('heuristic_review');
      expect(packet.armR).toBe('heuristic_review');
    },
  );

  it('colors every visible region when the pedagogical context is complete', () => {
    const packet = engine.compute(analysis({ headTilt: measurement(1) }), coachingSkeleton(), 1, 1000, frontalPlieContext);
    const regions = [
      'torsoAlignment', 'spine', 'shoulder', 'pelvis', 'armL', 'armR',
      'legL', 'legR', 'footL', 'footR', 'cog', 'head',
    ] as const;

    for (const region of regions) {
      expect(packet[region], region).not.toBe('blocked');
      expect(packet[region], region).not.toBe('heuristic_review');
    }
  });

  it('marks a clear frontal knee-to-foot deviation red without calling it valgus', () => {
    const skeletonWithDeviation = coachingSkeleton();
    skeletonWithDeviation.kneeL.x = 520;
    const packet = engine.compute(analysis({ headTilt: measurement(1) }), skeletonWithDeviation, 1, 1000, frontalPlieContext);

    expect(packet.legL).toBe('heuristic_strong_attention');
    expect(packet.footL).toBe('heuristic_strong_attention');
  });

  it('keeps the projected torso-center relation in Nicole review when torso geometry is predicted', () => {
    const skeletonWithPredictedTorso = coachingSkeleton();
    (skeletonWithPredictedTorso.sternum as typeof skeletonWithPredictedTorso.sternum & { isPredicted?: boolean }).isPredicted = true;

    const packet = engine.compute(
      analysis({ headTilt: measurement(1) }),
      skeletonWithPredictedTorso,
      1,
      1000,
      frontalPlieContext,
    );

    expect(packet.cog).toBe('heuristic_review');
  });
});
