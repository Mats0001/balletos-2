/**
 * teacherHeuristic.ts
 *
 * Interne Lehrer-Heuristik-Typen (PROJECT_DECISION 2026-08-11, Berater Heisig)
 *
 * Strenge Trennung:
 *   MeasurementObservation  → Rohwert, Einheit, Unsicherheit, Provenienz (kein Status)
 *   TeacherHeuristicEngine  → TeacherHeuristicState (kein CORRECT/WARNING/ERROR)
 *   Renderer               → zeichnet nur TeacherOverlayPacket, berechnet NICHTS
 *
 * TeacherHeuristicState ist absichtlich NICHT 'CORRECT'/'WARNING'/'ERROR':
 *   - Verhindert Verwechslung mit validierten wissenschaftlichen Schwellen
 *   - Erst die UI-Schicht übersetzt in Grün/Gelb/Rot
 */

// ─── INTERNE HEURISTIK-ZUSTÄNDE ────────────────────────────────────────────

/**
 * Interne Zustände der Lehrer-Heuristik.
 * Kein CORRECT / WARNING / ERROR – diese Begriffe sind für validierte
 * wissenschaftliche Schwellen reserviert.
 *
 * UI-Übersetzung:
 *   heuristic_match            → Grün
 *   heuristic_attention        → Gelb/Orange
 *   heuristic_strong_attention → Rot
 *   *_uncertain                → gleiche Grundfarbe, aber fein gepunktet
 *   blocked                    → keine Bewertung; Aufnahme-Gate entscheidet
 */
export type TeacherHeuristicBaseState =
  | 'heuristic_match'
  | 'heuristic_attention'
  | 'heuristic_strong_attention';

export type TeacherHeuristicState =
  | TeacherHeuristicBaseState
  | 'heuristic_match_uncertain'
  | 'heuristic_attention_uncertain'
  | 'heuristic_strong_attention_uncertain'
  | 'heuristic_review'             // Legacy-Kompatibilität: gelb fein gepunktet
  | 'blocked';                     // Keine auswertbare Aufnahme, kein Farburteil

export type TeacherRegionKey =
  | 'torsoAlignment' | 'spine' | 'shoulder' | 'pelvis'
  | 'armL' | 'armR' | 'legL' | 'legR'
  | 'footL' | 'footR' | 'cog' | 'head';

export const TEACHER_REGION_KEYS: readonly TeacherRegionKey[] = Object.freeze([
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
]);

// ─── OVERLAY PACKET ─────────────────────────────────────────────────────────

/**
 * Der einzige Vertrag zwischen TeacherHeuristicEngine und Renderer.
 * Der Renderer DARF aus diesem Packet Farben ableiten, aber KEINE
 * eigenen Heuristiken berechnen.
 *
 * Fehlende oder blockierte Bereiche → 'blocked' (niemals auto-Grün).
 */
export interface TeacherOverlayPacket {
  // ── Körperbereiche ──────────────────────────────────────────────────
  /** projected_torso_alignment: Rumpfachse, Schulter+Hüftlinie-Relation */
  torsoAlignment: TeacherHeuristicState;

  /** Wirbelsäulenachse / spineTilt */
  spine: TeacherHeuristicState;

  /** Schultersymmetrie / shoulderSymmetry */
  shoulder: TeacherHeuristicState;

  /** Becken-Neigung / projected_hip_line_obliquity (früher pelvicTilt) */
  pelvis: TeacherHeuristicState;

  /** Armlinienqualität links */
  armL: TeacherHeuristicState;

  /** Armlinienqualität rechts */
  armR: TeacherHeuristicState;

  /** Sichtbare Knie-Fuß-Projektion links; keine Valgus-/Ursachendiagnose */
  legL: TeacherHeuristicState;

  /** Sichtbare Knie-Fuß-Projektion rechts; keine Valgus-/Ursachendiagnose */
  legR: TeacherHeuristicState;

  /**
   * projected_shin_foot_relation links (früher SICKLE/WING).
   * Nur gültig wenn View+Mirror+Visibility-Gates bestanden.
   */
  footL: TeacherHeuristicState;

  /**
   * projected_shin_foot_relation rechts.
   */
  footR: TeacherHeuristicState;

  /**
   * projected_torso_center_proxy (früher CoG).
   * Nur gültig wenn Ankles sichtbar und Geometry valide.
   */
  cog: TeacherHeuristicState;

  /** Kopf-/Hals-Ausrichtung */
  head: TeacherHeuristicState;

  // ── Provenienz ──────────────────────────────────────────────────────
  /** Policy-Version für Audit */
  policyVersion: string;

  /** Stream-Epoch: Ungültig wenn Clip wechselt */
  streamEpoch: number;

  /**
   * Timestamp des Frames, für den dieser Packet gilt (Sekunden).
   * Renderer-Snapshot ist ungültig wenn videoTime abweicht.
   */
  framePtsSeconds: number;
}

// ─── FARB-MAPPING ────────────────────────────────────────────────────────────

/**
 * UI-Übersetzung TeacherHeuristicState → CSS-Farbe.
 * Nur für den Renderer – kein anderer Code darf direkt Farben zuweisen.
 */
export const HEURISTIC_COLORS: Record<TeacherHeuristicState, string> = Object.freeze({
  heuristic_match:            '#30d158',              // Grün
  heuristic_attention:        '#ffd60a',              // Gelb
  heuristic_strong_attention: '#ff453a',              // Rot
  heuristic_match_uncertain:            '#30d158',    // Grün fein gepunktet
  heuristic_attention_uncertain:        '#ffd60a',    // Gelb fein gepunktet
  heuristic_strong_attention_uncertain: '#ff453a',    // Rot fein gepunktet
  heuristic_review:           '#ffd60a',              // Gelb fein gepunktet – Nicole prüft
  blocked:                    '#ffd60a',              // Gelb fein gepunktet – fehlende Evidenz
});

/**
 * Mikropunkt-Muster fuer Review-Zustaende. Mit runden Linienenden wirkt das
 * aus normalem Abstand beinahe geschlossen und wird erst beim Hinsehen als
 * Evidenzhinweis erkennbar.
 */
export const HEURISTIC_DASH: Record<TeacherHeuristicState, number[]> = Object.freeze({
  heuristic_match:            [],
  heuristic_attention:        [],
  heuristic_strong_attention: [],
  heuristic_match_uncertain:            [0.75, 3.25],
  heuristic_attention_uncertain:        [0.75, 3.25],
  heuristic_strong_attention_uncertain: [0.75, 3.25],
  heuristic_review:           [0.75, 3.25],
  blocked:                    [0.75, 3.25],
});

// ─── HELPER ─────────────────────────────────────────────────────────────────

/**
 * Gibt die Anzeigefarbe für einen Zustand zurück.
 * Sicher: 'blocked' ist NIE Grün.
 */
export function heuristicColor(state: TeacherHeuristicState): string {
  return HEURISTIC_COLORS[state];
}

/** Gibt das Strich-Muster für einen Zustand zurück. */
export function heuristicDash(state: TeacherHeuristicState): number[] {
  return HEURISTIC_DASH[state];
}

export function heuristicBaseState(state: TeacherHeuristicState): TeacherHeuristicBaseState | null {
  if (state === 'heuristic_match' || state === 'heuristic_match_uncertain') return 'heuristic_match';
  if (state === 'heuristic_attention' || state === 'heuristic_attention_uncertain' || state === 'heuristic_review') {
    return 'heuristic_attention';
  }
  if (state === 'heuristic_strong_attention' || state === 'heuristic_strong_attention_uncertain') {
    return 'heuristic_strong_attention';
  }
  return null;
}

export function heuristicHasUncertainEvidence(state: TeacherHeuristicState): boolean {
  return state === 'heuristic_match_uncertain'
    || state === 'heuristic_attention_uncertain'
    || state === 'heuristic_strong_attention_uncertain'
    || state === 'heuristic_review'
    || state === 'blocked';
}

export function withUncertainEvidence(
  state: TeacherHeuristicBaseState,
  uncertain: boolean,
): TeacherHeuristicState {
  if (!uncertain) return state;
  if (state === 'heuristic_match') return 'heuristic_match_uncertain';
  if (state === 'heuristic_attention') return 'heuristic_attention_uncertain';
  return 'heuristic_strong_attention_uncertain';
}

/**
 * Erstellt ein vollständig blockiertes Overlay-Packet.
 * Wird verwendet wenn keine Pose-Daten verfügbar sind (no_pose, Timeout etc.)
 */
export function createBlockedPacket(framePtsSeconds: number, streamEpoch: number): TeacherOverlayPacket {
  return {
    torsoAlignment: 'blocked',
    spine: 'blocked',
    shoulder: 'blocked',
    pelvis: 'blocked',
    armL: 'blocked',
    armR: 'blocked',
    legL: 'blocked',
    legR: 'blocked',
    footL: 'blocked',
    footR: 'blocked',
    cog: 'blocked',
    head: 'blocked',
    policyVersion: '0.4.0-phase-evidence-separation',
    streamEpoch,
    framePtsSeconds,
  };
}
