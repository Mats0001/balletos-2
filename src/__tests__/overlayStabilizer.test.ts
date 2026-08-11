// ─────────────────────────────────────────────────────────────────────────────
// OverlayStabilizer Tests
//
// Berater-Abnahme Kriterium 6:
//   – blocked entfernt Grün SOFORT
//   – Keine Verzögerung bei strong_attention
//   – Hysterese bei match↔attention
//   – Generation-Reset löscht alle History
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverlayStabilizer } from '../services/overlayStabilizer';
import { TeacherOverlayPacket, TeacherHeuristicState } from '../types/teacherHeuristic';

function makePacket(overrides: Partial<Record<string, TeacherHeuristicState>> = {}): TeacherOverlayPacket {
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
    framePtsSeconds: 1.0,
    ...overrides,
  } as TeacherOverlayPacket;
}

describe('OverlayStabilizer', () => {
  let stabilizer: OverlayStabilizer;
  let mockNow: number;

  beforeEach(() => {
    stabilizer = new OverlayStabilizer();
    mockNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockNow);
  });

  it('accepts initial state immediately', () => {
    const pkt = makePacket({ spine: 'heuristic_attention' });
    const result = stabilizer.stabilize(pkt, 1);
    expect(result.spine).toBe('heuristic_attention');
  });

  it('blocked removes green IMMEDIATELY (Berater Kriterium 6)', () => {
    // First: establish green
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    // Then: blocked
    const result = stabilizer.stabilize(makePacket({ spine: 'blocked' }), 1);
    expect(result.spine).toBe('blocked');
  });

  it('strong_attention is applied IMMEDIATELY (safety)', () => {
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    const result = stabilizer.stabilize(makePacket({ spine: 'heuristic_strong_attention' }), 1);
    expect(result.spine).toBe('heuristic_strong_attention');
  });

  it('match→attention requires 300ms hold (worsening hysteresis)', () => {
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);

    // First attention signal: NOT yet switched
    mockNow = 1100;
    const r1 = stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);
    expect(r1.spine).toBe('heuristic_match'); // Still green – hold not met

    // After 300ms total from first pending: switch
    mockNow = 1400;
    const r2 = stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);
    expect(r2.spine).toBe('heuristic_attention'); // Now yellow
  });

  it('attention→match requires 500ms hold (improvement hysteresis)', () => {
    // Start with attention
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);

    // Improvement signal: NOT yet switched
    mockNow = 1200;
    const r1 = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    expect(r1.spine).toBe('heuristic_attention'); // Still yellow

    // After 500ms from first pending: switch
    mockNow = 1700;
    const r2 = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    expect(r2.spine).toBe('heuristic_match'); // Now green
  });

  it('pending state resets when raw state reverts', () => {
    stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);

    // Start worsening
    mockNow = 1200;
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);

    // Revert to match – should cancel pending
    mockNow = 1250;
    const r = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    expect(r.spine).toBe('heuristic_match'); // Pending cancelled
  });

  it('generation change resets all history', () => {
    // Establish state in generation 1
    stabilizer.stabilize(makePacket({ spine: 'heuristic_attention' }), 1);

    // New generation: should accept immediately
    const result = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 2);
    expect(result.spine).toBe('heuristic_match'); // No hysteresis from gen 1
  });

  it('blocked→match transition requires worsening hold (blocked has lowest severity)', () => {
    stabilizer.stabilize(makePacket({ spine: 'blocked' }), 1);
    // blocked severity=-1, match severity=0 → isWorsening=true (0 > -1) → needs 300ms
    mockNow = 1100;
    const r1 = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    expect(r1.spine).toBe('blocked'); // Still blocked – hold not met

    mockNow = 1400;
    const r2 = stabilizer.stabilize(makePacket({ spine: 'heuristic_match' }), 1);
    expect(r2.spine).toBe('heuristic_match'); // Now match after 300ms
  });
});
