// ─────────────────────────────────────────────────────────────────────────────
// CapabilityManager Tests (v2 – Berater 2026-08-11)
//
// Separated capabilities:
//   – FrameClockCapability: timing source accuracy
//   – PoseCapability: pose data quality
//
// Berater-Abnahme Kriterien:
//   – frameClock='unavailable' → ALL colors blocked (fail-closed)
//   – frameClock='approximate_media_clock' → colors allowed, show ⚠️
//   – pose='projected_2d' → angles max 'provisional'
//   – Capabilities are session-stable (lock once, reset on source change)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityManager } from '../services/capabilityTier';

describe('CapabilityManager', () => {
  let mgr: CapabilityManager;

  beforeEach(() => {
    mgr = new CapabilityManager();
  });

  // ── INITIALIZATION ──────────────────────────────────────────────────────

  it('defaults to unavailable/projected_2d before determination', () => {
    expect(mgr.frameClock).toBe('unavailable');
    expect(mgr.pose).toBe('projected_2d');
    expect(mgr.isLocked).toBe(false);
  });

  // ── FRAME CLOCK CAPABILITY ─────────────────────────────────────────────

  it('determines presented_frame_pts when rVFC available', () => {
    mgr.determine(true, false, true);
    expect(mgr.frameClock).toBe('presented_frame_pts');
    expect(mgr.isLocked).toBe(true);
  });

  it('determines approximate_media_clock when rVFC not available', () => {
    mgr.determine(false, false, true);
    expect(mgr.frameClock).toBe('approximate_media_clock');
  });

  it('determines unavailable when no video element', () => {
    mgr.determine(false, false, false);
    expect(mgr.frameClock).toBe('unavailable');
  });

  // ── POSE CAPABILITY ────────────────────────────────────────────────────

  it('determines world_proxy when world landmarks available', () => {
    mgr.determine(true, true, true);
    expect(mgr.pose).toBe('world_proxy');
  });

  it('determines projected_2d when no world landmarks', () => {
    mgr.determine(true, false, true);
    expect(mgr.pose).toBe('projected_2d');
  });

  // ── SESSION STABILITY ──────────────────────────────────────────────────

  it('capabilities are session-stable – re-determination is ignored', () => {
    mgr.determine(false, false, true); // approximate
    const caps = mgr.determine(true, true, true); // would be presented+world
    expect(caps.frameClock).toBe('approximate_media_clock'); // Still old
    expect(caps.pose).toBe('projected_2d'); // Still old
  });

  it('resetSession allows re-determination', () => {
    mgr.determine(false, false, true);
    mgr.resetSession();
    mgr.determine(true, true, true);
    expect(mgr.frameClock).toBe('presented_frame_pts');
    expect(mgr.pose).toBe('world_proxy');
  });

  // ── GATING: FAIL-CLOSED ────────────────────────────────────────────────

  it('unavailable frameClock blocks all colors (fail-closed)', () => {
    expect(CapabilityManager.canOutputColors('unavailable')).toBe(false);
  });

  it('presented_frame_pts allows colors', () => {
    expect(CapabilityManager.canOutputColors('presented_frame_pts')).toBe(true);
  });

  it('approximate_media_clock allows colors', () => {
    expect(CapabilityManager.canOutputColors('approximate_media_clock')).toBe(true);
  });

  it('approximate_media_clock is flagged as approximate', () => {
    expect(CapabilityManager.isApproximate('approximate_media_clock')).toBe(true);
    expect(CapabilityManager.isApproximate('presented_frame_pts')).toBe(false);
  });

  // ── POSE STATUS LIMITS ─────────────────────────────────────────────────

  it('projected_2d maxes at provisional', () => {
    expect(CapabilityManager.getMaxPoseStatus('projected_2d')).toBe('provisional');
  });

  it('world_proxy maxes at provisional', () => {
    expect(CapabilityManager.getMaxPoseStatus('world_proxy')).toBe('provisional');
  });

  it('calibrated_multiview_3d can be valid', () => {
    expect(CapabilityManager.getMaxPoseStatus('calibrated_multiview_3d')).toBe('valid');
  });
});
