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
 *   - Erst die UI-Schicht übersetzt in Grün/Gelb/Rot/Grau
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
 *   blocked                    → Grau (gestrichelt)
 */
export type TeacherHeuristicState =
  | 'heuristic_match'              // Sieht gut aus – KI-Vorschlag "korrekt"
  | 'heuristic_attention'          // Prüf-/Beobachtungsbedarf
  | 'heuristic_strong_attention'   // Deutliche Abweichung – Korrekturbedarf
  | 'blocked';                     // Keine Evidenz – neutral, niemals Grün

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

  /** Bein-Heuristik links (Knieflexion + Valgus-Drift) */
  legL: TeacherHeuristicState;

  /** Bein-Heuristik rechts */
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

  // ── Provenienz (Berater-Briefing 2026-08-11, Pflichtfelder) ────────

  /** Stabile Video-ID */
  sourceVideoId: string;

  /** PTS des Frames (Sekunden) */
  sourcePts: number;

  /** Monotone Frame-Sequenznummer (-1 bei Tier B) */
  frameSequence: number;

  /** Stream-Epoch: Ungültig wenn Clip wechselt */
  streamEpoch: number;

  /** Geometry-Hash: `${videoWidth}x${videoHeight}` */
  geometryId: string;

  /** Modellversion (z.B. MediaPipe Pose Landmarker) */
  modelVersion: string;

  /** Version der Heuristik-Engine */
  heuristicVersion: string;

  /** Policy-Version für Audit */
  policyVersion: string;

  /** Quelle der Heuristik */
  heuristicSource: 'engine' | 'manual';

  /** Gründe warum einzelne Bereiche blocked sind (Debugging) */
  blockReasons: string[];

  /** Referenzen auf verwendete Beobachtungen (IDs) */
  observationRefs: string[];

  // ── Compat (wird in Phase 2 entfernt) ──────────────────────────────
  /** @deprecated Nutze sourcePts stattdessen */
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
  blocked:                    'rgba(255,255,255,0.18)', // Grau – fehlende Evidenz
});

/**
 * Strich-Muster für 'blocked'-Zustand (gestrichelt = visuell neutral).
 */
export const HEURISTIC_DASH: Record<TeacherHeuristicState, number[]> = Object.freeze({
  heuristic_match:            [],
  heuristic_attention:        [],
  heuristic_strong_attention: [],
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
export function createBlockedPacket(
  framePtsSeconds: number,
  streamEpoch: number,
  sourceVideoId: string = '',
  blockReasons: string[] = ['no_pose_data'],
): TeacherOverlayPacket {
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
    sourceVideoId,
    sourcePts: framePtsSeconds,
    frameSequence: -1,
    streamEpoch,
    geometryId: '0x0',
    modelVersion: 'mediapipe-pose-landmarker-full-v0.3',
    heuristicVersion: '0.3.0',
    policyVersion: '0.3.0-teacher-ampel',
    heuristicSource: 'engine',
    blockReasons,
    observationRefs: [],
    framePtsSeconds,
  };
}
