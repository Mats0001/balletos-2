// ─────────────────────────────────────────────────────────────────────────────
// CapabilityTier Tests
//
// Berater-Abnahme Kriterien 4 + 5:
//   – Tier B heißt niemals 'valid'
//   – Tier C kann niemals Farben durchreichen
//   – Tier ist session-stabil (kein Frame-Flicker)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityTierManager } from '../services/capabilityTier';

describe('CapabilityTierManager', () => {
  let mgr: CapabilityTierManager;

  beforeEach(() => {
    mgr = new CapabilityTierManager();
  });

  it('defaults to Tier A before determination', () => {
    expect(mgr.getTier()).toBe('A');
    expect(mgr.isTierLocked()).toBe(false);
  });

  it('determines Tier A when no world landmarks', () => {
    const tier = mgr.determineTier(false, 30);
    expect(tier).toBe('A');
    expect(mgr.isTierLocked()).toBe(true);
  });

  it('determines Tier B when world landmarks + sufficient FPS', () => {
    const tier = mgr.determineTier(true, 30);
    expect(tier).toBe('B');
  });

  it('stays Tier A when world landmarks but insufficient FPS', () => {
    const tier = mgr.determineTier(true, 15);
    expect(tier).toBe('A');
  });

  it('tier is session-stable – re-determination is ignored', () => {
    mgr.determineTier(false, 30); // A
    const tier2 = mgr.determineTier(true, 60); // Would be B, but locked
    expect(tier2).toBe('A'); // Still A
  });

  it('resetSession allows re-determination', () => {
    mgr.determineTier(false, 30); // A
    mgr.resetSession();
    const tier2 = mgr.determineTier(true, 30); // Now B
    expect(tier2).toBe('B');
  });

  // ── BERATER KRITERIUM 4: Tier B heißt niemals valid ──────────────────

  it('Tier B max status is provisional, never valid', () => {
    expect(CapabilityTierManager.getMaxStatus('B')).toBe('provisional');
  });

  it('assertTierBNeverValid throws in dev when Tier B outputs valid', () => {
    mgr.determineTier(true, 30); // Tier B
    expect(() => mgr.assertTierBNeverValid('valid')).toThrow();
  });

  it('assertTierBNeverValid does NOT throw for provisional', () => {
    mgr.determineTier(true, 30); // Tier B
    expect(() => mgr.assertTierBNeverValid('provisional')).not.toThrow();
  });

  it('assertTierBNeverValid does NOT throw for Tier A with valid', () => {
    mgr.determineTier(false, 30); // Tier A
    expect(() => mgr.assertTierBNeverValid('valid')).not.toThrow();
  });

  // ── BERATER KRITERIUM 5: Tier C kann keine Farben durchreichen ───────

  it('Tier C cannot output colors', () => {
    expect(CapabilityTierManager.canOutputColors('C')).toBe(false);
  });

  it('Tier C max status is blocked', () => {
    expect(CapabilityTierManager.getMaxStatus('C')).toBe('blocked');
  });

  it('Tier A can output colors', () => {
    expect(CapabilityTierManager.canOutputColors('A')).toBe(true);
  });

  it('Tier B can output colors (but only provisional)', () => {
    expect(CapabilityTierManager.canOutputColors('B')).toBe(true);
  });
});
