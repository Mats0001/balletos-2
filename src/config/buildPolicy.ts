/**
 * BUILD POLICY – Unveränderliche Sicherheitsschranken für diesen Build.
 *
 * Berater-Entscheidung 2026-08-10: React Context allein ist kein ausreichender
 * Sicherheitsmechanismus. Diese Policy ist Object.freeze() – zur Laufzeit NICHT
 * überschreibbar.
 *
 * PROJECT_DECISION 2026-08-10 (Lehrer-Ampel):
 *   allowExperimentalTeacherTrafficLight: true
 *   → Vollständiger Ampelmodus für Nicoles Lehrerbetrieb freigegeben.
 *   → Ampel ist KI-gestützter pädagogischer Vorschlag, kein validiertes Urteil.
 *   → Nicole entscheidet über Annahme, Änderung und Kommunikation jedes Vorschlags.
 *   → Grundfarbe und Evidenzsicherheit sind getrennt: Grün/Gelb/Rot beschreibt
 *     das aggregierte Phasenurteil. Einzelpunkte markieren leichte Unsicherheit,
 *     feine Punktpaare schwache Evidenz; die Grundfarbe bleibt erhalten.
 *   → Weiche Aufnahmefehler lassen die Ampel mit Punktpaaren weiterlaufen.
 *   → Nur technisch nicht auswertbare Aufnahmen stoppen mit „Aufnahme korrigieren“.
 *
 * Gesperrt bleiben (unabhängig vom Ampelmodus):
 *   allowValidatedThresholdScoring / allowAutomaticSafetyClaims /
 *   allowAutomaticDiagnosisClaims / allowUnreviewedLearnerOutput /
 *   allowUnreviewedParentOutput / allowAutomaticHomeworkGeneration
 */
export const BUILD_POLICY = Object.freeze({
  // ── EXPERIMENTELLER LEHRER-AMPELMODUS ─────────────────────────────────────
  /** Vollständige Rot/Gelb/Grün-Heuristik für Nicole – FREIGEGEBEN (Berater 2026-08-10) */
  allowExperimentalTeacherTrafficLight: true,

  // ── DAUERHAFT GESPERRTE CLAIMS ────────────────────────────────────────────
  /** Validiertes wissenschaftliches Threshold-Scoring – DEAKTIVIERT */
  allowValidatedThresholdScoring: false,
  /** Safety-Claims und Verletzungswarnungen – DEAKTIVIERT */
  allowAutomaticSafetyClaims: false,
  /** Diagnose-Claims – DEAKTIVIERT */
  allowAutomaticDiagnosisClaims: false,
  /** Alte Auto-Texte ohne metrikspezifischen Evidenzvertrag – DEAKTIVIERT */
  allowLegacyUngroundedCueGeneration: false,
  /** Lernenden-Output ohne Nicole-Bestätigung – DEAKTIVIERT */
  allowUnreviewedLearnerOutput: false,
  /** Eltern-Output ohne Nicole-Bestätigung – DEAKTIVIERT */
  allowUnreviewedParentOutput: false,
  /** Automatische Hausaufgaben-Generierung ohne Nicole-OK – DEAKTIVIERT */
  allowAutomaticHomeworkGeneration: false,

  // ── WEITERHIN ERLAUBT ─────────────────────────────────────────────────────
  /** Shadow-Metriken (Rohwerte ohne Urteil) – ERLAUBT */
  allowShadowMetrics: true,
  /** Epistemik-Badges und Display-only-Werte – ERLAUBT */
  allowDisplayOnlyMetrics: true,
  /** Lehrerannotationen und -reviews – ERLAUBT */
  allowTeacherReview: true,

  /** Policy-Version für Provenienz-Logging */
  policyVersion: '0.4.0-phase-evidence-separation',

  // ── BACKWARD-COMPAT ALIASES (für bestehenden Code) ──────────────────────────────
  /** @deprecated Verwende allowAutomaticHomeworkGeneration */
  allowHomeworkGeneration: false,
  /** @deprecated Verwende allowAutomaticSafetyClaims */
  allowSafetyClaims: false,
  /** @deprecated Verwende allowValidatedThresholdScoring */
  allowThresholdScoring: false,
} as const);

export type BuildPolicy = typeof BUILD_POLICY;

/**
 * The retired generator bundled scoring, diagnosis, safety and homework claims.
 * It may only run if every corresponding hard policy is explicitly enabled.
 */
export function canGenerateLegacyUngroundedCues(): boolean {
  return BUILD_POLICY.allowLegacyUngroundedCueGeneration
    && BUILD_POLICY.allowValidatedThresholdScoring
    && BUILD_POLICY.allowAutomaticDiagnosisClaims
    && BUILD_POLICY.allowAutomaticSafetyClaims
    && BUILD_POLICY.allowAutomaticHomeworkGeneration;
}

/**
 * Neutrale Messzustände – dürfen NIEMALS automatisch Grün werden.
 * (Berater 2026-08-10: fehlende Daten ≠ gute Ausführung)
 */
export const NEUTRAL_MEASUREMENT_CLASSES = new Set([
  'not_measurable',
  'blocked',
  'missing_landmark',
  'invalid_geometry',
  'wrong_camera',
  'occluded',
  'unassigned_person',
  'insufficient_temporal_data',
] as const);

/**
 * Ampel-Farben für den experimentellen Lehrer-Modus.
 * Nur gültig wenn BUILD_POLICY.allowExperimentalTeacherTrafficLight === true.
 */
export const TEACHER_AMPEL_COLORS = Object.freeze({
  CORRECT: '#30d158',              // Grün – heuristisch korrekte Ausführung
  WARNING: '#ffd60a',              // Gelb – Prüf-/Beobachtungsbedarf
  ERROR:   '#ff453a',              // Rot – deutliche heuristische Abweichung
  REVIEW:  '#ffd60a',              // Legacy-Kompatibilität; neue Evidenz führt den Linienstil getrennt
  NEUTRAL: '#ffd60a',              // Kompatibilität: keine graue Ampellücke
} as const);

/**
 * Lab-Build: Nur wenn VITE_LAB_MODE=true.
 */
export const IS_LAB_MODE = (import.meta as any).env?.VITE_LAB_MODE === 'true';
