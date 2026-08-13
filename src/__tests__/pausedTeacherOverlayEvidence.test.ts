import { describe, expect, it } from 'vitest';
import {
  buildPausedTeacherOverlayEvidence,
  clonePausedCacheLandmarks,
  confirmCausalTeacherOverlayEvidence,
  findExactCachedPoseLandmarks,
  shouldRefreshAnalysisForPosePacket,
} from '../services/pausedTeacherOverlayEvidence';
import { PoseLandmark } from '../services/realMediaPipePose';
import { FrameEntry } from '../services/frameInterpolator';
import {
  createBlockedPacket,
  heuristicHasUncertainEvidence,
  TeacherHeuristicState,
  TeacherOverlayPacket,
} from '../types/teacherHeuristic';

const REGION_KEYS = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
] as const;

const PAUSED_CONFIRMABLE_KEYS = REGION_KEYS;

function makePacket(
  state: TeacherHeuristicState,
  framePtsSeconds: number,
  overrides: Partial<TeacherOverlayPacket> = {},
): TeacherOverlayPacket {
  return {
    torsoAlignment: state,
    spine: state,
    shoulder: state,
    pelvis: state,
    armL: state,
    armR: state,
    legL: state,
    legR: state,
    footL: state,
    footR: state,
    cog: state,
    head: state,
    policyVersion: '0.4.0-phase-evidence-separation',
    streamEpoch: 1000,
    framePtsSeconds,
    ...overrides,
  };
}

function packets(
  state: TeacherHeuristicState,
  start: number,
  endExclusive: number,
  step = 0.05,
): TeacherOverlayPacket[] {
  const result: TeacherOverlayPacket[] = [];
  for (let pts = start; pts < endExclusive - 0.000_001; pts += step) {
    result.push(makePacket(state, Number(pts.toFixed(6))));
  }
  return result;
}

function expectAllBlocked(packet: TeacherOverlayPacket): void {
  for (const key of REGION_KEYS) expect(packet[key]).toBe('blocked');
}

function expectOnlyReviewStates(packet: TeacherOverlayPacket): void {
  for (const key of REGION_KEYS) {
    expect(packet[key] === 'blocked' || heuristicHasUncertainEvidence(packet[key])).toBe(true);
  }
}

function makeLandmarks(): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.46,
    y: 0.5,
    z: 0,
    visibility: 0.98,
  }));
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0, visibility: 0.98 };
  };
  set(0, 0.44, 0.405);
  set(7, 0.475, 0.407);
  set(8, 0.405, 0.407);
  set(9, 0.455, 0.425);
  set(10, 0.425, 0.425);
  set(11, 0.535, 0.47);
  set(12, 0.365, 0.47);
  set(13, 0.65, 0.455);
  set(14, 0.275, 0.535);
  set(15, 0.735, 0.445);
  set(16, 0.355, 0.615);
  set(19, 0.755, 0.44);
  set(20, 0.37, 0.625);
  set(23, 0.515, 0.615);
  set(24, 0.39, 0.615);
  set(25, 0.62, 0.69);
  set(26, 0.245, 0.69);
  set(27, 0.54, 0.795);
  set(28, 0.245, 0.795);
  set(29, 0.53, 0.8);
  set(30, 0.235, 0.8);
  set(31, 0.585, 0.795);
  set(32, 0.205, 0.795);
  return landmarks;
}

describe('confirmCausalTeacherOverlayEvidence', () => {
  it('keeps a single paused target frame neutral', () => {
    const result = confirmCausalTeacherOverlayEvidence(
      [],
      makePacket('heuristic_match', 0.5),
      1,
    );
    expectAllBlocked(result);
  });

  it.each([
    ['red', 'heuristic_strong_attention' as const, 0.1],
    ['yellow', 'heuristic_attention' as const, 0.3],
    ['green', 'heuristic_match' as const, 0.5],
  ])('confirms %s only from sufficient causal history', (_label, state, holdSeconds) => {
    const result = confirmCausalTeacherOverlayEvidence(
      packets(state, 0, holdSeconds),
      makePacket(state, holdSeconds),
      1,
    );
    for (const key of PAUSED_CONFIRMABLE_KEYS) expect(result[key]).toBe(state);
  });

  it('keeps composite torso evidence neutral when any constituent is blocked', () => {
    const history = packets('heuristic_match', 0, 0.5).map(packet => ({
      ...packet,
      shoulder: 'blocked' as const,
    }));
    const target = {
      ...makePacket('heuristic_match', 0.5),
      shoulder: 'blocked' as const,
    };

    const result = confirmCausalTeacherOverlayEvidence(history, target, 1);

    expect(result.torsoAlignment).toBe('blocked');
    expect(result.shoulder).toBe('blocked');
    expect(result.spine).toBe('heuristic_match');
    expect(result.pelvis).toBe('heuristic_match');
  });

  it('does not count future frames', () => {
    const result = confirmCausalTeacherOverlayEvidence(
      packets('heuristic_match', 0.55, 1),
      makePacket('heuristic_match', 0.5),
      1,
    );
    expectAllBlocked(result);
  });

  it('fails closed when causal packet provenance changes inside the window', () => {
    const history = packets('heuristic_match', 0, 0.5);
    history[5] = makePacket('heuristic_match', history[5].framePtsSeconds, {
      streamEpoch: 9999,
    });

    const result = confirmCausalTeacherOverlayEvidence(
      history,
      makePacket('heuristic_match', 0.5),
      1,
    );
    expectAllBlocked(result);
  });

  it('does not color alternating neighboring states', () => {
    const history = packets('heuristic_match', 0, 0.5).map((packet, index) => (
      makePacket(
        index % 2 === 0 ? 'heuristic_match' : 'heuristic_attention',
        packet.framePtsSeconds,
      )
    ));
    const result = confirmCausalTeacherOverlayEvidence(
      history,
      makePacket('heuristic_match', 0.5),
      1,
    );
    expectAllBlocked(result);
  });

  it('requires fresh confirmation after a no-pose packet', () => {
    const history = [
      ...packets('heuristic_match', 0, 0.5),
      createBlockedPacket(0.5, 1000),
    ];
    const result = confirmCausalTeacherOverlayEvidence(
      history,
      makePacket('heuristic_match', 0.55),
      1,
    );
    expectAllBlocked(result);
  });

  it('does not confirm across a cache gap larger than 200ms', () => {
    const result = confirmCausalTeacherOverlayEvidence(
      [makePacket('heuristic_attention', 0)],
      makePacket('heuristic_attention', 0.3),
      1,
    );
    expectAllBlocked(result);
  });

  it('does not freeze old green when the exact target first turns red', () => {
    const result = confirmCausalTeacherOverlayEvidence(
      packets('heuristic_match', 0, 0.55),
      makePacket('heuristic_strong_attention', 0.55),
      1,
    );
    expectAllBlocked(result);
  });

  it('preserves exact target provenance', () => {
    const target = makePacket('heuristic_match', 2.5, { streamEpoch: 4321 });
    const result = confirmCausalTeacherOverlayEvidence([], target, 7);

    expect(result.framePtsSeconds).toBe(2.5);
    expect(result.streamEpoch).toBe(4321);
    expect(result.policyVersion).toBe(target.policyVersion);
  });
});

describe('buildPausedTeacherOverlayEvidence', () => {
  const validInput = () => {
    const landmarks = makeLandmarks();
    const frames: FrameEntry[] = Array.from({ length: 14 }, (_, index) => ({
      timeMs: index * 50,
      resultKind: 'pose',
      landmarks,
    }));
    return {
      source: 'frame_cache' as const,
      frames,
      targetPtsSeconds: 0.65,
      streamEpoch: 1000,
      generation: 1,
      videoWidth: 960,
      videoHeight: 1280,
      cacheVideoWidth: 960,
      cacheVideoHeight: 1280,
      canOutputColors: true,
    };
  };

  it('uses isolated causal cache frames to confirm a paused target', () => {
    const input = validInput();
    const before = JSON.stringify(input.frames);
    const result = buildPausedTeacherOverlayEvidence(input);

    for (const key of REGION_KEYS) expect(result[key]).not.toBe('blocked');
    expect(result.framePtsSeconds).toBe(0.65);
    expect(result.streamEpoch).toBe(1000);
    expect(JSON.stringify(input.frames)).toBe(before);
  });

  it('blocks pause reprocessing without causal cache provenance', () => {
    const result = buildPausedTeacherOverlayEvidence({
      ...validInput(),
      source: 'pause_reprocess',
    });
    expectAllBlocked(result);
  });

  it('blocks mismatched cache geometry', () => {
    const result = buildPausedTeacherOverlayEvidence({
      ...validInput(),
      cacheVideoWidth: 640,
    });
    expectAllBlocked(result);
  });

  it('blocks colors when the runtime frame-clock capability is unavailable', () => {
    const result = buildPausedTeacherOverlayEvidence({
      ...validInput(),
      canOutputColors: false,
    });
    expectAllBlocked(result);
  });

  it('blocks when the cache has no exact target frame', () => {
    const input = validInput();
    input.frames.pop();
    const result = buildPausedTeacherOverlayEvidence(input);
    expectAllBlocked(result);
  });

  it('blocks malformed exact target landmarks', () => {
    const invalid = makeLandmarks();
    invalid[11] = { ...invalid[11], x: Number.NaN };
    const input = validInput();
    input.frames[13] = { ...input.frames[13], landmarks: invalid };
    const result = buildPausedTeacherOverlayEvidence(input);
    expectAllBlocked(result);
  });

  it('blocks an explicit no-pose gap in the causal cache window', () => {
    const input = validInput();
    input.frames[12] = {
      ...input.frames[12],
      resultKind: 'no_pose',
      landmarks: null,
    };
    const result = buildPausedTeacherOverlayEvidence(input);
    expectOnlyReviewStates(result);
  });

  it('does not invent lower-body and centre colour votes from invisible geometry', () => {
    const input = validInput();
    const lowVisibilityIndices = [25, 26, 27, 28, 31, 32];
    input.frames = input.frames.map(frame => ({
      ...frame,
      landmarks: frame.landmarks?.map((landmark, index) => (
        lowVisibilityIndices.includes(index)
          ? { ...landmark, visibility: 0 }
          : { ...landmark }
      )) ?? null,
    }));

    const result = buildPausedTeacherOverlayEvidence(input);

    for (const key of ['legL', 'legR', 'footL', 'footR', 'cog'] as const) {
      expect(result[key]).toBe('blocked');
    }
  });
});

describe('findExactCachedPoseLandmarks', () => {
  it('returns only exact real cache evidence and never an interpolated neighbor', () => {
    const exact = makeLandmarks();
    const future = makeLandmarks();
    future[0] = { ...future[0], x: 0.9 };
    const frames: FrameEntry[] = [
      { timeMs: 500, resultKind: 'pose', landmarks: exact },
      { timeMs: 533.333, resultKind: 'pose', landmarks: future },
    ];

    expect(findExactCachedPoseLandmarks(frames, 0.5)).toBe(exact);
    expect(findExactCachedPoseLandmarks(frames, 0.516)).toBeNull();
  });

  it('rejects an exact no-pose or malformed entry', () => {
    const malformed = makeLandmarks();
    malformed[0] = { ...malformed[0], y: Number.NaN };
    expect(findExactCachedPoseLandmarks([
      { timeMs: 500, resultKind: 'no_pose', landmarks: null },
    ], 0.5)).toBeNull();
    expect(findExactCachedPoseLandmarks([
      { timeMs: 500, resultKind: 'pose', landmarks: malformed },
    ], 0.5)).toBeNull();
  });

  it('clones repeated paused cache geometry deterministically without mutating input', () => {
    const input = makeLandmarks();
    const first = clonePausedCacheLandmarks(input);
    const second = clonePausedCacheLandmarks(input);

    expect(first).toEqual(input);
    expect(second).toEqual(input);
    expect(first).toEqual(second);
    expect(first).not.toBe(input);
    expect(first[0]).not.toBe(input[0]);

    first[0].x = 0.99;
    expect(input[0].x).not.toBe(0.99);
    expect(second[0].x).not.toBe(0.99);
  });
});

describe('shouldRefreshAnalysisForPosePacket', () => {
  it('never advances analysis state for repeated redraws of the same media PTS', () => {
    expect(shouldRefreshAnalysisForPosePacket(null, 2_500_000, 0)).toBe(true);
    expect(shouldRefreshAnalysisForPosePacket(2_500_000, 2_500_000, 50)).toBe(false);
    expect(shouldRefreshAnalysisForPosePacket(2_500_000, 2_500_000, 5_000)).toBe(false);
  });

  it('retains the 20fps throttle while accepting the next pose packet', () => {
    expect(shouldRefreshAnalysisForPosePacket(2_500_000, 2_516_667, 49.999)).toBe(false);
    expect(shouldRefreshAnalysisForPosePacket(2_500_000, 2_516_667, 50)).toBe(true);
  });
});
