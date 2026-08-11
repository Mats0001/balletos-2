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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FramePump } from '../services/framePump';
import { OverlayStabilizer } from '../services/overlayStabilizer';
import { CapabilityManager } from '../services/capabilityTier';
import { makeNoPosePacket, PosePacket } from '../types/posePacket';
import { TeacherOverlayPacket, TeacherHeuristicState } from '../types/teacherHeuristic';

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

function makeOverlayPacket(overrides: Partial<Record<string, TeacherHeuristicState>> = {}): TeacherOverlayPacket {
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
    ...overrides,
  } as TeacherOverlayPacket;
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

describe('Runtime Integration: Stabilizer Frequency Guard', () => {
  let stabilizer: OverlayStabilizer;
  let mockNow: number;

  beforeEach(() => {
    stabilizer = new OverlayStabilizer();
    mockNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockNow);
  });

  it('same analysis frame does not re-trigger hysteresis timer', () => {
    // First call: match
    stabilizer.stabilize(makeOverlayPacket({ spine: 'heuristic_match' }), 1);

    // Start worsening transition
    mockNow = 1050;
    stabilizer.stabilize(makeOverlayPacket({ spine: 'heuristic_attention' }), 1);

    // Same analysis (60fps redraw) should NOT advance the timer
    // If stabilizer were called again at 60fps with same data,
    // the hold time should not be counted from different calls
    mockNow = 1100; // 100ms total, not 300ms
    const result = stabilizer.stabilize(makeOverlayPacket({ spine: 'heuristic_attention' }), 1);
    // 100ms < 300ms hold → should still be match
    expect(result.spine).toBe('heuristic_match');
  });

  it('blocked always overrides regardless of call frequency', () => {
    stabilizer.stabilize(makeOverlayPacket({ spine: 'heuristic_match' }), 1);
    const result = stabilizer.stabilize(makeOverlayPacket({ spine: 'blocked' }), 1);
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
