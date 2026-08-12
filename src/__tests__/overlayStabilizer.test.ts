import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayStabilizer } from '../services/overlayStabilizer';
import { TeacherHeuristicState, TeacherOverlayPacket } from '../types/teacherHeuristic';

function makePacket(overrides: Partial<TeacherOverlayPacket> = {}): TeacherOverlayPacket {
  return {
    torsoAlignment: 'heuristic_match',
    spine: 'heuristic_match',
    shoulder: 'heuristic_match',
    pelvis: 'heuristic_match',
    armL: 'heuristic_match',
    armR: 'heuristic_match',
    legL: 'heuristic_match',
    legR: 'heuristic_match',
    footL: 'blocked',
    footR: 'blocked',
    cog: 'blocked',
    head: 'blocked',
    policyVersion: '0.2.0-teacher-ampel',
    streamEpoch: 1000,
    framePtsSeconds: 1,
    ...overrides,
  };
}

function confirmSpineState(
  stabilizer: OverlayStabilizer,
  state: TeacherHeuristicState,
  startPtsSeconds: number,
  holdMs: number,
  generation = 1,
): TeacherOverlayPacket {
  let result = stabilizer.stabilize(makePacket({
    spine: state,
    framePtsSeconds: startPtsSeconds,
  }), generation);
  for (let offsetMs = 50; offsetMs <= holdMs; offsetMs += 50) {
    result = stabilizer.stabilize(makePacket({
      spine: state,
      framePtsSeconds: startPtsSeconds + offsetMs / 1000,
    }), generation);
  }
  return result;
}

describe('OverlayStabilizer media-time contract', () => {
  let stabilizer: OverlayStabilizer;

  beforeEach(() => {
    stabilizer = new OverlayStabilizer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts every non-blocked region neutral', () => {
    const result = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 10,
    }), 1);

    expect(result.spine).toBe('blocked');
    expect(result.torsoAlignment).toBe('blocked');
  });

  it('confirms initial strong attention after 100ms of progressing video time', () => {
    const initial = stabilizer.stabilize(makePacket({
      spine: 'heuristic_strong_attention',
      framePtsSeconds: 1,
    }), 1);
    const tooEarly = stabilizer.stabilize(makePacket({
      spine: 'heuristic_strong_attention',
      framePtsSeconds: 1.099,
    }), 1);
    const confirmed = stabilizer.stabilize(makePacket({
      spine: 'heuristic_strong_attention',
      framePtsSeconds: 1.1,
    }), 1);

    expect(initial.spine).toBe('blocked');
    expect(tooEarly.spine).toBe('blocked');
    expect(confirmed.spine).toBe('heuristic_strong_attention');
  });

  it('confirms initial attention after 300ms of progressing video time', () => {
    confirmSpineState(stabilizer, 'heuristic_attention', 1, 250);

    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.299,
    }), 1).spine).toBe('blocked');
    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.3,
    }), 1).spine).toBe('heuristic_attention');
  });

  it('confirms initial green only after 500ms of progressing video time', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 450);

    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 1.499,
    }), 1).spine).toBe('blocked');
    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 1.5,
    }), 1).spine).toBe('heuristic_match');
  });

  it('does not let repeated paused-frame PTS age into a color', () => {
    let wallClockMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => wallClockMs);

    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);
    wallClockMs = 60_000;

    for (let redraw = 0; redraw < 120; redraw += 1) {
      const result = stabilizer.stabilize(makePacket({
        spine: 'heuristic_attention',
        framePtsSeconds: 1,
      }), 1);
      expect(result.spine).toBe('blocked');
    }
  });

  it('does not flash an established color when raw frames alternate below confirmation', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    for (let frame = 0; frame < 20; frame += 1) {
      const rawState: TeacherHeuristicState = frame % 2 === 0
        ? 'heuristic_attention'
        : 'heuristic_match';
      const result = stabilizer.stabilize(makePacket({
        spine: rawState,
        framePtsSeconds: 1.6 + frame * 0.05,
      }), 1);
      expect(result.spine).toBe('heuristic_match');
    }
  });

  it('applies blocked immediately to an established green region', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    const result = stabilizer.stabilize(makePacket({
      spine: 'blocked',
      framePtsSeconds: 1.51,
    }), 1);
    expect(result.spine).toBe('blocked');
  });

  it('requires full green reconfirmation after an immediate blocked frame', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);
    stabilizer.stabilize(makePacket({ spine: 'blocked', framePtsSeconds: 1.55 }), 1);

    const restarted = confirmSpineState(
      stabilizer,
      'heuristic_match',
      1.6,
      450,
    );
    const confirmed = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 2.1,
    }), 1);

    expect(restarted.spine).toBe('blocked');
    expect(confirmed.spine).toBe('heuristic_match');
  });

  it('requires 300ms for an established green-to-attention transition', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention', framePtsSeconds: 1.6 }), 1);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention', framePtsSeconds: 1.75 }), 1);

    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.899,
    }), 1).spine).toBe('heuristic_match');
    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.9,
    }), 1).spine).toBe('heuristic_attention');
  });

  it('requires 500ms for an established attention-to-green transition', () => {
    confirmSpineState(stabilizer, 'heuristic_attention', 1, 300);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match', framePtsSeconds: 1.4 }), 1);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match', framePtsSeconds: 1.55 }), 1);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match', framePtsSeconds: 1.7 }), 1);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match', framePtsSeconds: 1.85 }), 1);

    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 1.899,
    }), 1).spine).toBe('heuristic_attention');
    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 1.9,
    }), 1).spine).toBe('heuristic_match');
  });

  it('cancels a pending transition when the raw state reverts', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention', framePtsSeconds: 1.6 }), 1);

    const reverted = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 1.7,
    }), 1);
    const newPending = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.8,
    }), 1);

    expect(reverted.spine).toBe('heuristic_match');
    expect(newPending.spine).toBe('heuristic_match');
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.95,
    }), 1);
    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 2.099,
    }), 1).spine).toBe('heuristic_match');
  });

  it('resets to neutral when media time moves backwards', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    const afterBackwardJump = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 0.25,
    }), 1);
    expect(afterBackwardJump.spine).toBe('blocked');
  });

  it('resets to neutral instead of confirming across a large forward PTS gap', () => {
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1,
    }), 1);

    const afterGap = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 60,
    }), 1);
    expect(afterGap.spine).toBe('blocked');
  });

  it('clears an established color after a large forward PTS gap', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    const afterGap = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 60,
    }), 1);
    expect(afterGap.spine).toBe('blocked');
  });

  it('accepts the exact 200ms continuity boundary without skipping confirmation', () => {
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1,
    }), 1);
    const boundary = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.2,
    }), 1);
    const confirmed = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.3,
    }), 1);

    expect(boundary.spine).toBe('blocked');
    expect(confirmed.spine).toBe('heuristic_attention');
  });

  it('keeps its monotone reference through sub-epsilon backward PTS jitter', () => {
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1,
    }), 1);
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 0.999_999_5,
    }), 1);
    stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.15,
    }), 1);
    const confirmed = stabilizer.stabilize(makePacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.3,
    }), 1);

    expect(confirmed.spine).toBe('heuristic_attention');
  });

  it.each([
    ['generation', makePacket({ framePtsSeconds: 2 }), 2],
    ['stream epoch', makePacket({ streamEpoch: 1001, framePtsSeconds: 2 }), 1],
    ['policy version', makePacket({ policyVersion: '0.3.0-teacher-ampel', framePtsSeconds: 2 }), 1],
  ])('resets to neutral on %s change', (_label, packet, generation) => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    const result = stabilizer.stabilize(packet, generation);
    expect(result.spine).toBe('blocked');
  });

  it('requires full reconfirmation after a generation reset', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500, 1);

    const beforeHold = confirmSpineState(
      stabilizer,
      'heuristic_match',
      2,
      450,
      2,
    );
    const confirmed = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 2.5,
    }), 2);

    expect(beforeHold.spine).toBe('blocked');
    expect(confirmed.spine).toBe('heuristic_match');
  });

  it.each([
    ['non-finite PTS', { framePtsSeconds: Number.NaN }],
    ['negative PTS', { framePtsSeconds: -0.001 }],
    ['non-finite stream epoch', { streamEpoch: Number.POSITIVE_INFINITY }],
    ['empty policy version', { policyVersion: '' }],
  ])('fails closed for %s', (_label, overrides) => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);

    const result = stabilizer.stabilize(makePacket(overrides), 1);
    expect(result.spine).toBe('blocked');
    expect(result.torsoAlignment).toBe('blocked');

    const recovery = stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 2,
    }), 1);
    expect(recovery.spine).toBe('blocked');
  });

  it('fails a malformed region state closed without coloring it', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);
    const malformed = makePacket({
      spine: 'not-a-teacher-state' as TeacherHeuristicState,
      framePtsSeconds: 1.55,
    });

    expect(stabilizer.stabilize(malformed, 1).spine).toBe('blocked');
  });

  it('reset discards established color history', () => {
    confirmSpineState(stabilizer, 'heuristic_match', 1, 500);
    stabilizer.reset();

    expect(stabilizer.stabilize(makePacket({
      spine: 'heuristic_match',
      framePtsSeconds: 2,
    }), 1).spine).toBe('blocked');
  });
});
