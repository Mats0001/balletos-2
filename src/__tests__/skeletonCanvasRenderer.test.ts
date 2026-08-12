import { describe, expect, it } from 'vitest';
import {
  isTeacherOverlayPacketCurrent,
  renderSkeletonToCanvas,
  resolveTeacherGlowType,
  resolveTeacherOverlayStyle,
  TeacherOverlayRegionKey,
} from '../services/skeletonCanvasRenderer';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';
import type { VaganovaFullAnalysis, VaganovaMeasurement } from '../services/vaganovaAngleCalculator';
import { createBlockedPacket, TeacherHeuristicState } from '../types/teacherHeuristic';

const REGION_KEYS: TeacherOverlayRegionKey[] = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
];

const EXPECTED = {
  heuristic_match: { color: '#30d158', dash: [] },
  heuristic_attention: { color: '#ffd60a', dash: [] },
  heuristic_strong_attention: { color: '#ff453a', dash: [] },
  blocked: { color: 'rgba(255,255,255,0.18)', dash: [5, 4] },
} satisfies Record<TeacherHeuristicState, { color: string; dash: number[] }>;

interface StrokeRecord {
  color: string;
  alpha: number;
  dash: number[];
}

function createRecordingCanvas() {
  const strokes: StrokeRecord[] = [];
  let currentDash: number[] = [];
  const context = {
    canvas: { width: 1000, height: 1000 },
    strokeStyle: '#000000',
    fillStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    clearRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    setLineDash: (dash: number[]) => { currentDash = [...dash]; },
    stroke() {
      strokes.push({
        color: String(this.strokeStyle),
        alpha: this.globalAlpha,
        dash: [...currentDash],
      });
    },
  };
  const canvas = {
    width: 1000,
    height: 1000,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return { canvas, strokes };
}

const point = (x: number, y: number) => ({ x, y, vis: 1 });

const SKELETON: ReconstructedSkeleton = {
  head: point(500, 100),
  neck: point(500, 180),
  sternum: point(500, 300),
  navel: point(500, 430),
  pelvisCenter: point(500, 520),
  shoulderL: point(400, 200),
  shoulderR: point(600, 200),
  elbowL: point(320, 300),
  elbowR: point(680, 300),
  wristL: point(250, 380),
  wristR: point(750, 380),
  pelvisL: point(450, 520),
  pelvisR: point(550, 520),
  kneeL: point(450, 700),
  kneeR: point(550, 700),
  ankleL: point(440, 900),
  ankleR: point(560, 900),
  footL: point(400, 930),
  footR: point(600, 930),
};

const rawMeasurement = (
  confidence: number,
  status: 'CORRECT' | 'WARNING' | 'ERROR' = 'ERROR',
): VaganovaMeasurement => ({
  value: 99,
  unit: 'deg',
  confidence,
  label: 'adversarial raw status',
  measurement_class: 'vaganova_relation',
  status,
});

function rawAnalysis(confidence: number): VaganovaFullAnalysis {
  const raw = rawMeasurement(confidence);
  return {
    knieFlexionL: raw,
    knieFlexionR: raw,
    valgusDriftL: raw,
    valgusDriftR: raw,
    turnoutL: raw,
    turnoutR: raw,
    spineTilt: raw,
    epaulement: raw,
    portDeBrasL: raw,
    portDeBrasR: raw,
    pelvicTilt: raw,
    shoulderSymmetry: raw,
    shoulderElevationL: raw,
    shoulderElevationR: raw,
    armLineQualityL: raw,
    armLineQualityR: raw,
    headTilt: raw,
    plumbDeviation: raw,
  };
}

function renderTeacherPacket(
  confidence: number,
  frameContext: { streamEpoch: number; framePtsSeconds: number; policyVersion: string } | undefined = {
    streamEpoch: 42,
    framePtsSeconds: 2.5,
    policyVersion: '0.2.0-teacher-ampel',
  },
  selectedJointId: string = '',
  glowType?: 'GOOD' | 'CORRECTION',
) {
  const { canvas, strokes } = createRecordingCanvas();
  const packet = createBlockedPacket(2.5, 42);
  for (const key of REGION_KEYS) packet[key] = 'heuristic_match';

  renderSkeletonToCanvas(
    canvas,
    SKELETON,
    { x: 500, y: 520 },
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      showSkeleton: true,
      showMotionTrails: false,
      showCoG: false,
      showAngleArcs: false,
      selectedJointId,
      glowType,
      isPlie: true,
      vaganovaAnalysis: rawAnalysis(confidence),
      overlayMode: 'lehrer-ampel',
      overlayPacket: packet,
      overlayFrameContext: frameContext,
    },
  );

  return strokes;
}

describe('trusted skeleton color contract', () => {
  it.each(Object.entries(EXPECTED) as Array<[
    TeacherHeuristicState,
    { color: string; dash: number[] },
  ]>)('maps %s through the packet presentation contract', (state, expected) => {
    const packet = createBlockedPacket(2.5, 42);
    for (const key of REGION_KEYS) packet[key] = state;

    for (const key of REGION_KEYS) {
      expect(resolveTeacherOverlayStyle(packet, key)).toEqual({ state, ...expected });
    }
  });

  it('fails closed for a missing packet', () => {
    for (const key of REGION_KEYS) {
      expect(resolveTeacherOverlayStyle(undefined, key)).toEqual({
        state: 'blocked',
        ...EXPECTED.blocked,
      });
    }
  });

  it('fails closed for a malformed packet state', () => {
    const packet = createBlockedPacket(2.5, 42);
    (packet as unknown as Record<string, unknown>).spine = 'CORRECT';

    expect(resolveTeacherOverlayStyle(packet, 'spine')).toEqual({
      state: 'blocked',
      ...EXPECTED.blocked,
    });
  });

  it('rejects a packet from another stream, frame, or policy', () => {
    const packet = createBlockedPacket(2.5, 42);
    const current = {
      streamEpoch: 42,
      framePtsSeconds: 2.5,
      policyVersion: packet.policyVersion,
    };

    expect(isTeacherOverlayPacketCurrent(packet, current)).toBe(true);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, streamEpoch: 43 })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, framePtsSeconds: 2.6 })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, policyVersion: 'old-policy' })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, undefined)).toBe(false);
  });

  it('keeps missing and blocked evidence free of semantic glow colors', () => {
    expect(resolveTeacherGlowType('heuristic_match')).toBe('GOOD');
    expect(resolveTeacherGlowType('heuristic_attention')).toBeUndefined();
    expect(resolveTeacherGlowType('heuristic_strong_attention')).toBe('CORRECTION');
    expect(resolveTeacherGlowType('blocked')).toBeUndefined();
    expect(resolveTeacherGlowType(undefined)).toBeUndefined();
    expect(resolveTeacherGlowType('CORRECT')).toBeUndefined();
  });

  it('renders packet colors even when every legacy raw status says ERROR', () => {
    const strokes = renderTeacherPacket(0.95);

    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(true);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_attention.color)).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_strong_attention.color)).toBe(false);
  });

  it('keeps teacher traffic strokes stable when raw confidence changes', () => {
    const trafficStrokes = (confidence: number) => renderTeacherPacket(confidence)
      .filter(({ color }) => color === EXPECTED.heuristic_match.color);

    expect(trafficStrokes(0.05)).toEqual(trafficStrokes(0.99));
  });

  it('renders a mismatched packet as neutral dashed geometry', () => {
    const strokes = renderTeacherPacket(0.95, {
      streamEpoch: 99,
      framePtsSeconds: 2.5,
      policyVersion: '0.2.0-teacher-ampel',
    });

    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_attention.color)).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_strong_attention.color)).toBe(false);
    expect(strokes.some(({ color, dash }) => (
      color === EXPECTED.blocked.color && dash.join(',') === EXPECTED.blocked.dash.join(',')
    ))).toBe(true);
  });

  it('does not replace teacher packet colors with amber selection status', () => {
    const strokes = renderTeacherPacket(0.95, undefined, 'port_de_bras_arms');

    expect(strokes.some(({ color }) => color === '#f59e0b')).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(true);
  });

  it('suppresses semantic glow when packet provenance is stale', () => {
    const strokes = renderTeacherPacket(0.95, {
      streamEpoch: 99,
      framePtsSeconds: 2.5,
      policyVersion: '0.2.0-teacher-ampel',
    }, 'port_de_bras_arms', 'CORRECTION');

    expect(strokes.some(({ color }) => color === '#ff6b6b')).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.blocked.color)).toBe(true);
  });
});
