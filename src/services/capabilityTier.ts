// ─────────────────────────────────────────────────────────────────────────────
// CapabilityTier – Session-stable capability tier management
//
// Tiers determine what level of analysis and visualization is available.
// Once determined at session start, the tier does NOT change frame-by-frame.
//
// ARCHITEKTUR-VERTRAG (Berater 2026-08-11):
//   – Tier A/B/C wird beim Öffnen des Videos einmal ermittelt
//   – Ein verspäteter Frame löst keinen Tier-Wechsel aus
//   – Tier B heißt niemals 'valid' (nur 'provisional')
//   – Tier C kann niemals Farben durchreichen (alle Kanäle = 'blocked')
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capability Tier definitions:
 *
 * A – 2D Pose Angles (MediaPipe normalized landmarks)
 *     Full heuristic colors. Primary operating mode for BalletOS.
 *
 * B – 3D Kinematics (world landmarks available, sufficient FPS)
 *     Additional depth metrics. Status max = 'provisional', NEVER 'valid'.
 *     Colors are allowed but must show provisional indicator.
 *
 * C – Temporal Analysis (time-series over window)
 *     Aggregation only. NO colors – all body regions return 'blocked'.
 *     Reserved for future statistical features.
 */
export type CapabilityTier = 'A' | 'B' | 'C';

/** Maximum status a tier is allowed to output */
export type TierMaxStatus = 'valid' | 'provisional' | 'blocked';

// ─── TIER MANAGER ───────────────────────────────────────────────────────────

export class CapabilityTierManager {
  private _tier: CapabilityTier | null = null;
  private _locked = false;

  /** Get the current tier. Returns 'A' if not yet determined. */
  getTier(): CapabilityTier {
    return this._tier ?? 'A';
  }

  /** Whether the tier has been locked for this session */
  isTierLocked(): boolean {
    return this._locked;
  }

  /**
   * Determine and lock the capability tier for this session.
   * Called ONCE when video/camera is first opened.
   *
   * @param hasWorldLandmarks Whether MediaPipe provides world landmarks
   * @param videoFps Detected or estimated video frame rate
   * @returns The determined tier
   */
  determineTier(
    hasWorldLandmarks: boolean,
    videoFps: number = 30,
  ): CapabilityTier {
    if (this._locked) {
      console.warn(`[CapabilityTier] Tier already locked to '${this._tier}' – ignoring re-determination`);
      return this._tier!;
    }

    // Default: Tier A (safe, always available)
    let tier: CapabilityTier = 'A';

    // Upgrade to B if world landmarks available AND sufficient FPS
    if (hasWorldLandmarks && videoFps >= 24) {
      tier = 'B';
    }

    // Tier C is never auto-determined – only set explicitly via setTierC()

    this._tier = tier;
    this._locked = true;
    console.info(`[CapabilityTier] Session tier locked: ${tier}`);
    return tier;
  }

  /**
   * Explicitly set Tier C (temporal analysis mode).
   * Only for programmatic use – not auto-determined.
   */
  setTierC(): void {
    this._tier = 'C';
    this._locked = true;
    console.info('[CapabilityTier] Session tier locked: C (temporal, no colors)');
  }

  /** Reset for new session (new video or camera source) */
  resetSession(): void {
    this._tier = null;
    this._locked = false;
  }

  // ─── TIER GATING HELPERS ────────────────────────────────────────────────

  /**
   * Whether this tier is allowed to output heuristic colors.
   * A=true, B=true, C=false
   */
  static canOutputColors(tier: CapabilityTier): boolean {
    return tier !== 'C';
  }

  /**
   * Maximum status string a tier is allowed to produce.
   * A='valid', B='provisional', C='blocked'
   *
   * INVARIANT: Tier B darf niemals 'valid' ausgeben.
   */
  static getMaxStatus(tier: CapabilityTier): TierMaxStatus {
    switch (tier) {
      case 'A': return 'valid';
      case 'B': return 'provisional';
      case 'C': return 'blocked';
    }
  }

  /**
   * Runtime assertion: Tier B must never output 'valid'.
   * Call this wherever a status is about to be set.
   * Throws in dev, warns in production.
   */
  assertTierBNeverValid(status: string): void {
    if (this._tier === 'B' && status === 'valid') {
      const msg = '[CapabilityTier] VIOLATION: Tier B attempted to output status=valid. This is forbidden.';
      const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
      if (isDev) {
        throw new Error(msg);
      } else {
        console.error(msg);
      }
    }
  }
}

export const capabilityTierManager = new CapabilityTierManager();
