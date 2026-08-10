/**
 * BUILD POLICY – Unveränderliche Sicherheitsschranken für diesen Build.
 *
 * Berater-Empfehlung 2026-08-10: React Context allein ist kein ausreichender
 * Sicherheitsmechanismus. Diese Policy ist 'as const' – zur Laufzeit NICHT
 * überschreibbar. Nicole darf durch einen Schalter NIEMALS aus einem
 * unvalidierten Messwert einen wissenschaftlich validierten Score machen.
 *
 * Freigabe: allowThresholdScoring/allowSafetyClaims/allowHomeworkGeneration
 * bleiben false bis DecisionGate + validationArtifactId + Mocap-Protokoll.
 */
export const BUILD_POLICY = Object.freeze({
  /** Automatisches CORRECT/WARNING/ERROR – DEAKTIVIERT */
  allowThresholdScoring: false,
  /** Safety-Claims und Verletzungswarnungen – DEAKTIVIERT */
  allowSafetyClaims: false,
  /** KI-Hausaufgaben-Generierung – DEAKTIVIERT */
  allowHomeworkGeneration: false,
  /** Shadow-Metriken (Rohwerte ohne Urteil) – ERLAUBT */
  allowShadowMetrics: true,
  /** Epistemik-Badges und Display-only-Werte – ERLAUBT */
  allowDisplayOnlyMetrics: true,
  /** Lehrerannotationen und -reviews – ERLAUBT */
  allowTeacherReview: true,
  /** Policy-Version für Provenienz-Logging */
  policyVersion: '0.1.0-sprint0-safety',
} as const);

export type BuildPolicy = typeof BUILD_POLICY;

/**
 * Lab-Build: Nur wenn VITE_LAB_MODE=true.
 * Muss in der UI als "EXPERIMENTELL – NICHT VALIDIERTE AUSGABE" sichtbar sein.
 * Object.freeze() stellt sicher, dass die Policy auch zur Laufzeit nicht verändert werden kann.
 * (Berater 2026-08-10: 'as const' ist nur typseitig readonly, nicht zur Laufzeit unverländerlich.)
 */
export const IS_LAB_MODE = (import.meta as any).env?.VITE_LAB_MODE === 'true';
