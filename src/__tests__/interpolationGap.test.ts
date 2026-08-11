// ─────────────────────────────────────────────────────────────────────────────
// Interpolation Gap Tests
//
// Berater-Abnahme Kriterium 7:
//   – Keine Interpolation über no_pose-Lücken
//   – Lücken > 200ms werden als no_pose behandelt
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  findBracketingFrames,
  interpolateFrame,
  MAX_INTERPOLATION_GAP_MS,
  FrameEntry,
} from '../services/frameInterpolator';
import { PoseLandmark } from '../services/realMediaPipePose';

function makeLandmark(x: number, y: number): PoseLandmark {
  return { x, y, z: 0, visibility: 1.0 };
}

function makeFrame(timeMs: number, x: number = 0.5): FrameEntry {
  return {
    timeMs,
    landmarks: Array.from({ length: 33 }, () => makeLandmark(x, 0.5)),
  };
}

describe('frameInterpolator gap check', () => {
  it('MAX_INTERPOLATION_GAP_MS is 200', () => {
    expect(MAX_INTERPOLATION_GAP_MS).toBe(200);
  });

  it('interpolates when gap is within limit', () => {
    const frames = [makeFrame(1000, 0.3), makeFrame(1100, 0.7)]; // 100ms gap
    const result = findBracketingFrames(frames, 1050);
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(0.5);
  });

  it('refuses interpolation when gap exceeds 200ms (no_pose protection)', () => {
    const frames = [makeFrame(1000, 0.3), makeFrame(1300, 0.7)]; // 300ms gap
    const result = findBracketingFrames(frames, 1150);
    expect(result).toBeNull(); // Must refuse
  });

  it('allows interpolation at exactly 200ms gap', () => {
    const frames = [makeFrame(1000, 0.3), makeFrame(1200, 0.7)]; // exactly 200ms
    const result = findBracketingFrames(frames, 1100);
    expect(result).not.toBeNull();
  });

  it('refuses at 201ms gap', () => {
    const frames = [makeFrame(1000, 0.3), makeFrame(1201, 0.7)]; // 201ms gap
    const result = findBracketingFrames(frames, 1100);
    expect(result).toBeNull();
  });

  it('returns exact frame when queried at exact timestamp', () => {
    const frames = [makeFrame(1000), makeFrame(5000)]; // huge gap
    const result = findBracketingFrames(frames, 1000);
    // Exact match → before === after, t=0, no gap check needed
    expect(result).not.toBeNull();
    expect(result!.t).toBe(0);
  });

  it('interpolateFrame produces correct midpoint', () => {
    const a = [makeLandmark(0.0, 0.0)];
    const b = [makeLandmark(1.0, 1.0)];
    const mid = interpolateFrame(a, b, 0.5);
    expect(mid[0].x).toBeCloseTo(0.5);
    expect(mid[0].y).toBeCloseTo(0.5);
  });

  it('interpolateFrame skips low-visibility landmarks', () => {
    const a = [{ x: 0.0, y: 0.0, z: 0, visibility: 0.1 }]; // Low vis
    const b = [{ x: 1.0, y: 1.0, z: 0, visibility: 0.9 }]; // Good vis
    const result = interpolateFrame(a, b, 0.5);
    // Should use the higher-visibility one (b)
    expect(result[0].x).toBe(1.0);
  });
});
