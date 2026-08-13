// ─────────────────────────────────────────────────────────────────────────────
// OverlayStabilizer – Temporal color stabilization for TeacherOverlayPacket
//
// Prevents visual flicker in the ballet teacher traffic-light overlay by
// applying hysteresis and minimum hold times to state transitions. Confirmation
// is based exclusively on progressing video media time, never wall-clock time.
//
// ARCHITEKTUR-VERTRAG (Berater 2026-08-11):
//   – 'blocked'/'heuristic_review' entfernen Grün SOFORT (kein Delay)
//   – strong_attention wird nach 100ms bestätigt
//   – Verschlechterung (match→attention) nach 300ms Bestätigung
//   – Verbesserung (attention→match) nach 500ms Bestätigung
//   – Start/Seek/Clip-Wechsel → neutraler Start und kompletter Reset
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

type StateKey = Exclude<
  keyof TeacherOverlayPacket,
  'policyVersion' | 'streamEpoch' | 'framePtsSeconds'
>;

/** State fields in TeacherOverlayPacket that should be stabilized */
const STATE_KEYS: readonly StateKey[] = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
] as const;

const VALID_STATES: ReadonlySet<TeacherHeuristicState> = new Set([
  'blocked',
  'heuristic_review',
  'heuristic_match',
  'heuristic_attention',
  'heuristic_strong_attention',
]);

const MEDIA_TIME_EPSILON_SECONDS = 0.000_001;

/**
 * A hold window is evidence only while analysis frames remain continuous.
 * Runtime analysis targets 50ms; 200ms permits bounded scheduling jitter while
 * still treating tab stalls, dropped spans and unannounced seeks as a reset.
 */
const MAX_CONTINUOUS_EVIDENCE_GAP_SECONDS = 0.2;

// ─── SEVERITY ORDERING ──────────────────────────────────────────────────────

const SEVERITY: Record<TeacherHeuristicState, number> = {
  'blocked':                    -2,  // Special: always instant
  'heuristic_review':           -1,  // Yellow review, always instant
  'heuristic_match':             0,
  'heuristic_attention':         1,
  'heuristic_strong_attention':  2,
};

function isWorsening(from: TeacherHeuristicState, to: TeacherHeuristicState): boolean {
  return SEVERITY[to] > SEVERITY[from];
}

function isImproving(from: TeacherHeuristicState, to: TeacherHeuristicState): boolean {
  return SEVERITY[to] < SEVERITY[from]
    && to !== 'blocked'
    && to !== 'heuristic_review';
}

// ─── INTERNAL STATE ─────────────────────────────────────────────────────────

interface RegionState {
  /** Currently displayed (stabilized) state */
  displayedState: TeacherHeuristicState;
  /** The raw state being proposed (pending confirmation) */
  pendingState: TeacherHeuristicState | null;
  /** Video media time at which the pending state was first observed. */
  pendingSincePtsSeconds: number;
}

function isTeacherHeuristicState(value: unknown): value is TeacherHeuristicState {
  return typeof value === 'string' && VALID_STATES.has(value as TeacherHeuristicState);
}

function createNeutralPacket(raw: TeacherOverlayPacket): TeacherOverlayPacket {
  const result = { ...raw };
  for (const key of STATE_KEYS) result[key] = 'blocked';
  return result;
}

function confirmationHoldMs(
  displayed: TeacherHeuristicState,
  proposed: TeacherHeuristicState,
): number {
  if (proposed === 'blocked' || proposed === 'heuristic_review') return 0;
  if (proposed === 'heuristic_strong_attention') return STRONG_ATTENTION_CONFIRM_MS;

  // A new stream starts neutral. Green requires the longest positive-evidence
  // confirmation; yellow uses the ordinary worsening confirmation window.
  if (displayed === 'blocked' || displayed === 'heuristic_review') {
    return proposed === 'heuristic_match' ? IMPROVE_HOLD_MS : WORSEN_HOLD_MS;
  }

  if (isWorsening(displayed, proposed)) return WORSEN_HOLD_MS;
  if (isImproving(displayed, proposed)) return IMPROVE_HOLD_MS;
  return 0;
}

// ─── STABILIZER ─────────────────────────────────────────────────────────────

export class OverlayStabilizer {
  private _regions = new Map<StateKey, RegionState>();
  private _lastGeneration = -1;
  private _lastFramePtsSeconds: number | null = null;
  private _lastStreamEpoch: number | null = null;
  private _lastPolicyVersion: string | null = null;

  /**
   * Stabilize a raw TeacherOverlayPacket.
   *
   * Rules:
   * - blocked/review → SOFORT (safety: Grün muss sofort verschwinden)
   * - strong_attention → after 100 ms confirmation
   * - match → attention (Verschlechterung): nach WORSEN_HOLD_MS
   * - attention → match (Verbesserung): nach IMPROVE_HOLD_MS
   * - first non-blocked observation → neutral until confirmed
   * - repeated/paused frame PTS cannot advance confirmation
   * - discontinuous PTS, generation, stream or policy change → full reset
   */
  stabilize(raw: TeacherOverlayPacket, generation: number): TeacherOverlayPacket {
    const rawPtsSeconds = raw.framePtsSeconds;
    const metadataIsValid = Number.isFinite(rawPtsSeconds)
      && rawPtsSeconds >= 0
      && Number.isFinite(raw.streamEpoch)
      && typeof raw.policyVersion === 'string'
      && raw.policyVersion.length > 0
      && Number.isFinite(generation);

    if (!metadataIsValid) {
      this._regions.clear();
      this._lastGeneration = generation;
      this._lastFramePtsSeconds = null;
      this._lastStreamEpoch = Number.isFinite(raw.streamEpoch) ? raw.streamEpoch : null;
      this._lastPolicyVersion = typeof raw.policyVersion === 'string'
        ? raw.policyVersion
        : null;
      return createNeutralPacket(raw);
    }

    const contextChanged = generation !== this._lastGeneration
      || raw.streamEpoch !== this._lastStreamEpoch
      || raw.policyVersion !== this._lastPolicyVersion;
    const mediaTimeWentBackwards = this._lastFramePtsSeconds !== null
      && rawPtsSeconds < this._lastFramePtsSeconds - MEDIA_TIME_EPSILON_SECONDS;
    const evidenceGapIsTooLarge = this._lastFramePtsSeconds !== null
      && rawPtsSeconds - this._lastFramePtsSeconds
        > MAX_CONTINUOUS_EVIDENCE_GAP_SECONDS + MEDIA_TIME_EPSILON_SECONDS;
    const mediaTimeIsDiscontinuous = mediaTimeWentBackwards || evidenceGapIsTooLarge;

    if (contextChanged || mediaTimeIsDiscontinuous) {
      this._regions.clear();
    }

    this._lastGeneration = generation;
    this._lastStreamEpoch = raw.streamEpoch;
    this._lastPolicyVersion = raw.policyVersion;

    // Ignore sub-microsecond floating-point jitter, but never let media-time
    // confirmation move backwards.
    const effectivePtsSeconds = this._lastFramePtsSeconds === null
      || contextChanged
      || mediaTimeIsDiscontinuous
      ? rawPtsSeconds
      : Math.max(rawPtsSeconds, this._lastFramePtsSeconds);
    this._lastFramePtsSeconds = effectivePtsSeconds;

    const result = { ...raw };

    for (const key of STATE_KEYS) {
      const rawValue: unknown = raw[key];
      const rawState: TeacherHeuristicState = isTeacherHeuristicState(rawValue)
        ? rawValue
        : 'blocked';
      let region = this._regions.get(key);

      // Every new context starts neutral. The first non-blocked state must earn
      // its confirmation window using distinct, progressing video frames.
      if (!region) {
        region = {
          displayedState: 'blocked',
          pendingState: null,
          pendingSincePtsSeconds: effectivePtsSeconds,
        };
        this._regions.set(key, region);
      }

      // Same state as displayed → clear any pending, keep current
      if (rawState === region.displayedState) {
        region.pendingState = null;
        result[key] = region.displayedState;
        continue;
      }

      // ── INSTANT transitions ─────────────────────────────────────────
      // blocked/review: SOFORT (safety – Grün muss sofort weg)
      if (rawState === 'blocked' || rawState === 'heuristic_review') {
        region.displayedState = rawState;
        region.pendingState = null;
        result[key] = rawState;
        continue;
      }

      // ── DELAYED transitions ─────────────────────────────────────────
      const holdMs = confirmationHoldMs(region.displayedState, rawState);

      if (holdMs === 0) {
        // Same severity → instant
        region.displayedState = rawState;
        region.pendingState = null;
        result[key] = rawState;
        continue;
      }

      // Start or continue pending transition
      if (region.pendingState === rawState) {
        // Same pending state → check if hold time elapsed
        const elapsedMediaMs = (
          effectivePtsSeconds - region.pendingSincePtsSeconds
        ) * 1000;
        if (elapsedMediaMs + MEDIA_TIME_EPSILON_SECONDS * 1000 >= holdMs) {
          // Confirmed! Transition.
          region.displayedState = rawState;
          region.pendingState = null;
          result[key] = rawState;
        } else {
          // Still waiting → output old state
          result[key] = region.displayedState;
        }
      } else {
        // New pending state → start timer
        region.pendingState = rawState;
        region.pendingSincePtsSeconds = effectivePtsSeconds;
        result[key] = region.displayedState;
      }
    }

    return result;
  }

  /** Clear all state (e.g. on session end) */
  reset(): void {
    this._regions.clear();
    this._lastGeneration = -1;
    this._lastFramePtsSeconds = null;
    this._lastStreamEpoch = null;
    this._lastPolicyVersion = null;
  }
}

export const overlayStabilizer = new OverlayStabilizer();
