// capabilityTier.ts – Runtime capability contracts
//
// Two orthogonal capabilities (Berater 2026-08-11):
//   1. FrameClockCapability – how accurate is the frame timestamp?
//   2. PoseCapability – what kind of pose data is available?
//
// GATING RULES:
//   - frameClock='unavailable' → ALL colors blocked (fail-closed)
//   - frameClock='approximate_media_clock' → colors allowed, show ⚠️
//   - pose='projected_2d' → angles max 'provisional' (2D projection)

export type FrameClockCapability =
  | 'presented_frame_pts'      // rVFC mediaTime available
  | 'approximate_media_clock'  // rAF + video.currentTime
  | 'unavailable';             // no video / still image without metadata

export type PoseCapability =
  | 'projected_2d'             // MediaPipe normalized landmarks
  | 'world_proxy'              // worldLandmarks available
  | 'calibrated_multiview_3d'; // Future: real 3D

export interface RuntimeCapabilities {
  frameClock: FrameClockCapability;
  pose: PoseCapability;
  locked: boolean;
}

export class CapabilityManager {
  private _capabilities: RuntimeCapabilities = {
    frameClock: 'unavailable',
    pose: 'projected_2d',
    locked: false,
  };

  get capabilities(): Readonly<RuntimeCapabilities> {
    return this._capabilities;
  }

  get frameClock(): FrameClockCapability {
    return this._capabilities.frameClock;
  }

  get pose(): PoseCapability {
    return this._capabilities.pose;
  }

  get isLocked(): boolean {
    return this._capabilities.locked;
  }

  /**
   * Determine and lock capabilities for this session.
   * Called ONCE when video/camera is first opened.
   */
  determine(
    usingRvfc: boolean,
    hasWorldLandmarks: boolean,
    hasVideoElement: boolean,
  ): RuntimeCapabilities {
    if (this._capabilities.locked) {
      console.warn('[Capability] Already locked – ignoring re-determination');
      return this._capabilities;
    }

    const frameClock: FrameClockCapability = !hasVideoElement
      ? 'unavailable'
      : usingRvfc
        ? 'presented_frame_pts'
        : 'approximate_media_clock';

    const pose: PoseCapability = hasWorldLandmarks
      ? 'world_proxy'
      : 'projected_2d';

    this._capabilities = { frameClock, pose, locked: true };
    console.info(`[Capability] Locked: clock=${frameClock}, pose=${pose}`);
    return this._capabilities;
  }

  /** Reset for new session (new video or camera source) */
  resetSession(): void {
    this._capabilities = {
      frameClock: 'unavailable',
      pose: 'projected_2d',
      locked: false,
    };
  }

  // ─── GATING HELPERS ────────────────────────────────────────────────────

  /** Whether colors can be output. Fail-closed: unavailable → false */
  static canOutputColors(clock: FrameClockCapability): boolean {
    return clock !== 'unavailable';
  }

  /** Whether the clock is only approximate (show ⚠️ indicator) */
  static isApproximate(clock: FrameClockCapability): boolean {
    return clock === 'approximate_media_clock';
  }

  /** Max status level for current pose capability */
  static getMaxPoseStatus(pose: PoseCapability): 'valid' | 'provisional' {
    // Only calibrated 3D can be 'valid' – everything else is provisional
    return pose === 'calibrated_multiview_3d' ? 'valid' : 'provisional';
  }
}

export const capabilityManager = new CapabilityManager();

// ─── BACKWARD COMPAT ──────────────────────────────────────────────────────
// Old code imports capabilityTierManager — keep alias until fully migrated
export const capabilityTierManager = capabilityManager as any;
export const CapabilityTierManager = CapabilityManager as any;
export type CapabilityTierManager = any;
