// ─────────────────────────────────────────────────────────────────────────────
// OverlayStabilizer – Temporal color stabilization for TeacherOverlayPacket
//
// Prevents visual flicker in the ballet teacher traffic-light overlay by
// applying hysteresis and minimum hold times to state transitions.
//
// ARCHITEKTUR-VERTRAG (Berater 2026-08-11):
//   – 'blocked' entfernt Grün SOFORT (kein Delay)
//   – strong_attention wird nach 100ms bestätigt
//   – Verschlechterung (match→attention) nach 300ms Bestätigung
//   – Verbesserung (attention→match) nach 500ms Bestätigung
//   – Generation-Wechsel → kompletter Reset
// ─────────────────────────────────────────────────────────────────────────────

import {
  TeacherOverlayPacket,
  TeacherHeuristicState,
} from '../types/teacherHeuristic';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

/** ms before a worsening transition (match→attention) is confirmed */
const WORSEN_HOLD_MS = 300;

/** ms before an improvement transition (attention→match) is confirmed */
const IMPROVE_HOLD_MS = 500;

const STRONG_ATTENTION_CONFIRM_MS = 100;

/** State fields in TeacherOverlayPacket that should be stabilized */
const STATE_KEYS: ReadonlyArray<keyof TeacherOverlayPacket> = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
] as const;

// ─── SEVERITY ORDERING ──────────────────────────────────────────────────────

const SEVERITY: Record<TeacherHeuristicState, number> = {
  'blocked':                    -1,  // Special: always instant
  'heuristic_match':             0,
  'heuristic_attention':         1,
  'heuristic_strong_attention':  2,
};

function isWorsening(from: TeacherHeuristicState, to: TeacherHeuristicState): boolean {
  return SEVERITY[to] > SEVERITY[from];
}

function isImproving(from: TeacherHeuristicState, to: TeacherHeuristicState): boolean {
  return SEVERITY[to] < SEVERITY[from] && to !== 'blocked';
}

// ─── INTERNAL STATE ─────────────────────────────────────────────────────────

interface RegionState {
  /** Currently displayed (stabilized) state */
  displayedState: TeacherHeuristicState;
  /** The raw state being proposed (pending confirmation) */
  pendingState: TeacherHeuristicState | null;
  /** When the pending state was first seen (performance.now()) */
  pendingSince: number;
}

// ─── STABILIZER ─────────────────────────────────────────────────────────────

export class OverlayStabilizer {
  private _regions = new Map<string, RegionState>();
  private _lastGeneration = -1;

  /**
   * Stabilize a raw TeacherOverlayPacket.
   *
   * Rules:
   * - blocked → SOFORT (safety: Grün muss sofort verschwinden)
   * - strong_attention → SOFORT (safety: Rot-Signal nicht verzögern)
   * - match → attention (Verschlechterung): nach WORSEN_HOLD_MS
   * - attention → match (Verbesserung): nach IMPROVE_HOLD_MS
   * - Generation change → full reset
   */
  stabilize(raw: TeacherOverlayPacket, generation: number): TeacherOverlayPacket {
    const now = performance.now();

    // Generation change → complete reset
    if (generation !== this._lastGeneration) {
      this._regions.clear();
      this._lastGeneration = generation;
      console.info('[OverlayStabilizer] Generation reset → clearing all history');
    }

    // Clone the packet for output
    const result = { ...raw };

    for (const key of STATE_KEYS) {
      const rawState = raw[key] as TeacherHeuristicState;
      if (typeof rawState !== 'string') continue;

      const regionKey = key as string;
      let region = this._regions.get(regionKey);

      // First frame for this region → accept immediately
      if (!region) {
        region = {
          displayedState: rawState,
          pendingState: null,
          pendingSince: 0,
        };
        this._regions.set(regionKey, region);
        (result as any)[key] = rawState;
        continue;
      }

      // Same state as displayed → clear any pending, keep current
      if (rawState === region.displayedState) {
        region.pendingState = null;
        (result as any)[key] = region.displayedState;
        continue;
      }

      // ── INSTANT transitions ─────────────────────────────────────────
      // blocked: SOFORT (safety – Grün muss sofort weg)
      if (rawState === 'blocked') {
        region.displayedState = rawState;
        region.pendingState = null;
        (result as any)[key] = rawState;
        continue;
      }

      // ── DELAYED transitions ─────────────────────────────────────────
      const holdMs = rawState === 'heuristic_strong_attention'
        ? STRONG_ATTENTION_CONFIRM_MS  // Brief confirmation to prevent single-frame noise
        : isWorsening(region.displayedState, rawState)
          ? WORSEN_HOLD_MS
          : isImproving(region.displayedState, rawState)
            ? IMPROVE_HOLD_MS
            : 0; // Same severity level → instant

      if (holdMs === 0) {
        // Same severity → instant
        region.displayedState = rawState;
        region.pendingState = null;
        (result as any)[key] = rawState;
        continue;
      }

      // Start or continue pending transition
      if (region.pendingState === rawState) {
        // Same pending state → check if hold time elapsed
        if (now - region.pendingSince >= holdMs) {
          // Confirmed! Transition.
          region.displayedState = rawState;
          region.pendingState = null;
          (result as any)[key] = rawState;
        } else {
          // Still waiting → output old state
          (result as any)[key] = region.displayedState;
        }
      } else {
        // New pending state → start timer
        region.pendingState = rawState;
        region.pendingSince = now;
        (result as any)[key] = region.displayedState;
      }
    }

    return result;
  }

  /** Clear all state (e.g. on session end) */
  reset(): void {
    this._regions.clear();
    this._lastGeneration = -1;
  }
}

export const overlayStabilizer = new OverlayStabilizer();
