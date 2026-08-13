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
 *   heuristic_review           → Gelb (gestrichelt, Nicole prüft)
 *   blocked                    → Gelb (gestrichelt, keine verwertbare Evidenz)
 */
export type TeacherHeuristicState =
  | 'heuristic_match'              // Sieht gut aus – KI-Vorschlag "korrekt"
  | 'heuristic_attention'          // Prüf-/Beobachtungsbedarf
  | 'heuristic_strong_attention'   // Deutliche Abweichung – Korrekturbedarf
  | 'heuristic_review'             // Kontext/Evidenz reicht nur für Nicoles Prüfung
  | 'blocked';                     // Keine Evidenz – gelb gestrichelt, niemals Grün/Rot

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
  heuristic_review:           '#ffd60a',              // Gelb gestrichelt – Nicole prüft
  blocked:                    '#ffd60a',              // Gelb gestrichelt – fehlende Evidenz
});

/**
 * Strich-Muster für Review-Zustände (gestrichelt = Nicole prüft).
 */
export const HEURISTIC_DASH: Record<TeacherHeuristicState, number[]> = Object.freeze({
  heuristic_match:            [],
  heuristic_attention:        [],
  heuristic_strong_attention: [],
  heuristic_review:           [7, 4],
  blocked:                    [5, 4],
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
    policyVersion: '0.3.0-pedagogical-full-coverage',
    streamEpoch,
    framePtsSeconds,
  };
}
