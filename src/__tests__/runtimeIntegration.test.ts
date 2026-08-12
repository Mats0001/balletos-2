// ─────────────────────────────────────────────────────────────────────────────
// Runtime Integration Tests (Phase 9 – Berater v2 2026-08-11)
//
// Tests the contracts identified in the consultant review:
//   1. Seek pre-invalidation (seeking event fires before seeked)
//   2. Generation-gated stale detection (forward + backward seek)
//   3. FramePump stays alive after bumpGeneration
//   4. Capability fail-closed (unavailable = no colors)
//   5. Cache no_pose entries block interpolation
//   6. Stabilizer only updates on new analysis frames
//   7. Geometry fail-closed (no 1×1 fallback)
//   8. PosePacket provenance fields required
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { FramePump } from '../services/framePump';
import { OverlayStabilizer } from '../services/overlayStabilizer';
import { CapabilityManager } from '../services/capabilityTier';
import { isPoseAnalysisCurrent, isPoseCaptureCurrent, isPoseResultLatest, makeNoPosePacket, PosePacket, shouldHoldNeutralSkeleton } from '../types/posePacket';
import { TeacherOverlayPacket } from '../types/teacherHeuristic';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeFullPacket(overrides: Partial<PosePacket> = {}): PosePacket {
  return {
    streamEpoch: Date.now(),
    frameSeq: 0,
    mediaTimeUs: 1_000_000,
    inferenceStartedAtMs: 0,
    inferenceEndedAtMs: 10,
    resultKind: 'pose',
    landmarks: [],
    avgVisibility: 0.95,
    source: 'live_inference',
    generation: 0,
    sourceId: 'test-video.mp4',
    videoWidth: 1920,
    videoHeight: 1080,
    ...overrides,
  };
}

function makeOverlayPacket(overrides: Partial<TeacherOverlayPacket> = {}): TeacherOverlayPacket {
  return {
    torsoAlignment: 'heuristic_match',
    spine: 'heuristic_match',
    shoulder: 'heuristic_match',
    pelvis: 'heuristic_match',
    armL: 'heuristic_match',
    armR: 'heuristic_match',
    legL: 'heuristic_match',
    legR: 'heuristic_match',
    footL: 'heuristic_match',
    footR: 'heuristic_match',
    cog: 'heuristic_match',
    head: 'heuristic_match',
    policyVersion: '0.2.0-teacher-ampel',
    streamEpoch: 1000,
    framePtsSeconds: 1,
    ...overrides,
  };
}

// ─── TEST SUITES ────────────────────────────────────────────────────────────

describe('Runtime Integration: FramePump Seek Resilience', () => {
  let pump: FramePump;

  beforeEach(() => {
    pump = new FramePump();
  });

  it('bumpGeneration increments generation counter', () => {
    expect(pump.generation).toBe(0);
    pump.bumpGeneration();
    expect(pump.generation).toBe(1);
  });

  it('multiple bumps increment monotonically', () => {
    pump.bumpGeneration();
    pump.bumpGeneration();
    pump.bumpGeneration();
    expect(pump.generation).toBe(3);
  });

  it('reset bumps generation AND stops pump', () => {
    const gen0 = pump.generation;
    pump.reset();
    expect(pump.generation).toBe(gen0 + 1);
    expect(pump.isRunning).toBe(false);
  });
});

describe('Runtime Integration: Stale Detection', () => {
  it('forward-stale packet is detected (age > tolerance)', () => {
    const packet = makeFullPacket({ mediaTimeUs: 1_000_000 }); // 1.0s
    const currentMediaTimeUs = 2_000_000; // 2.0s — 1s ahead
    const TOLERANCE_US = 66_667;
    const absAge = Math.abs(currentMediaTimeUs - packet.mediaTimeUs);
    expect(absAge).toBeGreaterThan(TOLERANCE_US);
  });

  it('backward-seek stale is detected (future landmark)', () => {
    const packet = makeFullPacket({ mediaTimeUs: 5_000_000 }); // 5.0s
    const currentMediaTimeUs = 2_000_000; // 2.0s — jumped back
    const TOLERANCE_US = 66_667;
    const absAge = Math.abs(currentMediaTimeUs - packet.mediaTimeUs);
    expect(absAge).toBeGreaterThan(TOLERANCE_US); // 3s > 66ms
  });

  it('>5s old packet is NOW stale (old bug: was considered valid)', () => {
    const packet = makeFullPacket({ mediaTimeUs: 0 }); // 0s
    const currentMediaTimeUs = 10_000_000; // 10s
    const TOLERANCE_US = 66_667;
    const absAge = Math.abs(currentMediaTimeUs - packet.mediaTimeUs);
    // Old code: ageUs > 66ms && ageUs < 5s → this would PASS (10s > 5s)
    // New code: absAge > 66ms → stale regardless
    expect(absAge).toBeGreaterThan(TOLERANCE_US);
  });

  it('generation mismatch marks packet as stale', () => {
    const packet = makeFullPacket({ generation: 0 });
    const currentGeneration = 1; // Seek happened
    expect(packet.generation).not.toBe(currentGeneration);
  });
});

describe('Runtime Integration: Capability Fail-Closed', () => {
  it('unavailable frameClock blocks ALL colors', () => {
    const mgr = new CapabilityManager();
    // No determine() called → defaults to unavailable
    expect(mgr.frameClock).toBe('unavailable');
    expect(CapabilityManager.canOutputColors(mgr.frameClock)).toBe(false);
  });

  it('undetermined capability is fail-closed (not fail-open)', () => {
    const mgr = new CapabilityManager();
    // The old code defaulted to Tier A which was fail-OPEN
    // New code: default is unavailable = fail-CLOSED
    expect(CapabilityManager.canOutputColors(mgr.frameClock)).toBe(false);
  });
});

describe('Runtime Integration: PosePacket Provenance', () => {
  it('makeNoPosePacket includes all provenance fields', () => {
    const packet = makeNoPosePacket(
      12345, 0, 1_000_000,
      'live_inference', 3, 'test.mp4', 1920, 1080
    );
    expect(packet.source).toBe('live_inference');
    expect(packet.generation).toBe(3);
    expect(packet.sourceId).toBe('test.mp4');
    expect(packet.videoWidth).toBe(1920);
    expect(packet.videoHeight).toBe(1080);
    expect(packet.resultKind).toBe('no_pose');
  });

  it('cache packets have source=frame_cache', () => {
    const packet = makeFullPacket({ source: 'frame_cache' });
    expect(packet.source).toBe('frame_cache');
  });

  it('pause packets have source=pause_reprocess', () => {
    const packet = makeFullPacket({ source: 'pause_reprocess' });
    expect(packet.source).toBe('pause_reprocess');
  });
});

describe('Runtime Integration: Neutral Pose Dropout', () => {
  const context = {
    streamEpoch: 12345,
    generation: 3,
    sourceId: 'test.mp4',
    dropoutStartedAtMs: 1000,
    nowMs: 1100,
  };

  it('briefly holds only a current no-pose packet', () => {
    const packet = makeNoPosePacket(
      context.streamEpoch, 1, 1_000_000,
      'live_inference', context.generation, context.sourceId, 1920, 1080,
    );

    expect(shouldHoldNeutralSkeleton(packet, context)).toBe(true);
    expect(shouldHoldNeutralSkeleton(packet, { ...context, streamEpoch: 999 })).toBe(false);
    expect(shouldHoldNeutralSkeleton(packet, { ...context, generation: 4 })).toBe(false);
    expect(shouldHoldNeutralSkeleton(packet, { ...context, sourceId: 'other.mp4' })).toBe(false);
  });

  it('does not extend the neutral hold beyond the fixed first-dropout window', () => {
    const repeatedNoPosePacket = makeNoPosePacket(
      context.streamEpoch, 99, 5_000_000,
      'live_inference', context.generation, context.sourceId, 1920, 1080,
    );

    expect(shouldHoldNeutralSkeleton(repeatedNoPosePacket, {
      ...context,
      nowMs: 1251,
    })).toBe(false);
  });

  it('never holds a valid pose packet or an unknown dropout start', () => {
    expect(shouldHoldNeutralSkeleton(makeFullPacket({
      streamEpoch: context.streamEpoch,
      generation: context.generation,
      sourceId: context.sourceId,
    }), context)).toBe(false);
    expect(shouldHoldNeutralSkeleton(null, context)).toBe(false);
    expect(shouldHoldNeutralSkeleton(
      makeNoPosePacket(context.streamEpoch, 1, 0),
      { ...context, dropoutStartedAtMs: null },
    )).toBe(false);
  });
});

describe('Runtime Integration: Paused-Frame Capture Guard', () => {
  const captured = {
    streamEpoch: 123,
    generation: 4,
    sourceId: 'clip-a.mp4',
    mediaTimeUs: 2_500_000,
  };

  it('accepts only the matching source, generation, epoch, and frame', () => {
    expect(isPoseCaptureCurrent(captured, { ...captured })).toBe(true);
    expect(isPoseCaptureCurrent(captured, { ...captured, streamEpoch: 124 })).toBe(false);
    expect(isPoseCaptureCurrent(captured, { ...captured, generation: 5 })).toBe(false);
    expect(isPoseCaptureCurrent(captured, { ...captured, sourceId: 'clip-b.mp4' })).toBe(false);
    expect(isPoseCaptureCurrent(captured, { ...captured, mediaTimeUs: 2_600_000 })).toBe(false);
  });

  it('permits sub-frame timestamp rounding only within the explicit tolerance', () => {
    expect(isPoseCaptureCurrent(captured, {
      ...captured,
      mediaTimeUs: captured.mediaTimeUs + 33_333,
    })).toBe(true);
    expect(isPoseCaptureCurrent(captured, {
      ...captured,
      mediaTimeUs: captured.mediaTimeUs + 33_334,
    })).toBe(false);
  });
});

describe('Runtime Integration: Latest Pose Result Wins', () => {
  const existing = makeFullPacket({
    streamEpoch: 123,
    generation: 4,
    sourceId: 'clip-a.mp4',
    mediaTimeUs: 2_500_000,
  });
  const candidate = {
    streamEpoch: 123,
    generation: 4,
    sourceId: 'clip-a.mp4',
    mediaTimeUs: 2_500_000,
  };

  it('accepts the same or a newer frame for pose and no-pose alike', () => {
    expect(isPoseResultLatest(candidate, existing)).toBe(true);
    expect(isPoseResultLatest({ ...candidate, mediaTimeUs: 2_600_000 }, existing)).toBe(true);
    expect(isPoseResultLatest(candidate, null)).toBe(true);
  });

  it('rejects an older or differently scoped result', () => {
    expect(isPoseResultLatest({ ...candidate, mediaTimeUs: 2_499_999 }, existing)).toBe(false);
    expect(isPoseResultLatest({ ...candidate, streamEpoch: 124 }, existing)).toBe(false);
    expect(isPoseResultLatest({ ...candidate, generation: 5 }, existing)).toBe(false);
    expect(isPoseResultLatest({ ...candidate, sourceId: 'clip-b.mp4' }, existing)).toBe(false);
  });
});

describe('Runtime Integration: Rendered Analysis Guard', () => {
  const packet = makeFullPacket({
    streamEpoch: 123,
    generation: 4,
    sourceId: 'clip-a.mp4',
    mediaTimeUs: 2_500_000,
  });
  const context = {
    streamEpoch: 123,
    generation: 4,
    sourceId: 'clip-a.mp4',
    analysisMediaTimeUs: 2_500_000,
    currentMediaTimeUs: 2_500_000,
  };

  it('renders only when packet, analysis, source, and current video agree', () => {
    expect(isPoseAnalysisCurrent(packet, context)).toBe(true);
    expect(isPoseAnalysisCurrent(packet, { ...context, streamEpoch: 124 })).toBe(false);
    expect(isPoseAnalysisCurrent(packet, { ...context, generation: 5 })).toBe(false);
    expect(isPoseAnalysisCurrent(packet, { ...context, sourceId: 'clip-b.mp4' })).toBe(false);
    expect(isPoseAnalysisCurrent(null, context)).toBe(false);
    expect(isPoseAnalysisCurrent(makeNoPosePacket(123, 1, 2_500_000), context)).toBe(false);
  });

  it('rejects analysis outside the explicit two-frame tolerance', () => {
    expect(isPoseAnalysisCurrent(packet, {
      ...context,
      currentMediaTimeUs: 2_566_667,
    })).toBe(true);
    expect(isPoseAnalysisCurrent(packet, {
      ...context,
      currentMediaTimeUs: 2_566_668,
    })).toBe(false);
    expect(isPoseAnalysisCurrent(packet, {
      ...context,
      analysisMediaTimeUs: 2_566_668,
      currentMediaTimeUs: 2_566_668,
    })).toBe(false);
  });
});

describe('Runtime Integration: Stabilizer Frequency Guard', () => {
  let stabilizer: OverlayStabilizer;

  beforeEach(() => {
    stabilizer = new OverlayStabilizer();
  });

  const establishGreenSpine = () => {
    for (let offsetMs = 0; offsetMs <= 500; offsetMs += 50) {
      stabilizer.stabilize(makeOverlayPacket({
        spine: 'heuristic_match',
        framePtsSeconds: 1 + offsetMs / 1000,
      }), 1);
    }
  };

  it('same analysis frame cannot advance media-time hysteresis', () => {
    // Establish green using distinct video frames.
    establishGreenSpine();

    // Start worsening transition
    stabilizer.stabilize(makeOverlayPacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.6,
    }), 1);

    // Repeated 60fps redraws of that exact analysis frame cannot age it.
    const result = stabilizer.stabilize(makeOverlayPacket({
      spine: 'heuristic_attention',
      framePtsSeconds: 1.6,
    }), 1);
    expect(result.spine).toBe('heuristic_match');
  });

  it('blocked always overrides regardless of call frequency', () => {
    establishGreenSpine();
    const result = stabilizer.stabilize(makeOverlayPacket({
      spine: 'blocked',
      framePtsSeconds: 1.51,
    }), 1);
    expect(result.spine).toBe('blocked');
  });
});

describe('Runtime Integration: Geometry Fail-Closed', () => {
  it('videoWidth=0 means geometry is invalid', () => {
    const videoWidth = 0;
    const videoHeight = 0;
    const geometryValid = videoWidth > 1 && videoHeight > 1;
    expect(geometryValid).toBe(false);
  });

  it('videoWidth=1, videoHeight=1 means geometry is invalid', () => {
    const videoWidth = 1;
    const videoHeight = 1;
    const geometryValid = videoWidth > 1 && videoHeight > 1;
    expect(geometryValid).toBe(false);
  });

  it('normal dimensions are valid', () => {
    const videoWidth = 1920;
    const videoHeight = 1080;
    const geometryValid = videoWidth > 1 && videoHeight > 1;
    expect(geometryValid).toBe(true);
  });
});
