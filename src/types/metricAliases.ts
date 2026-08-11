/**
 * Kanonische Metric-IDs & Legacy-Alias-Adapter.
 * Berater-Briefing 2026-08-11: Neue Namen sind kanonische IDs in allen neuen Verträgen.
 * Legacy-Namen existieren ausschließlich in diesem zentralen, read-only Kompatibilitätsadapter.
 * Alt- und Neuname dürfen NICHT als zwei getrennte veränderbare Werte gespeichert werden.
 */

/** Kanonische Metric-IDs — einzige erlaubte IDs in neuen Verträgen */
export const CANONICAL_METRIC_IDS = {
  projected_hip_line_obliquity: 'projected_hip_line_obliquity',
  projected_torso_center_proxy: 'projected_torso_center_proxy',
  projected_trunk_position_between_ankles: 'projected_trunk_position_between_ankles',
  projected_foot_axis_angle: 'projected_foot_axis_angle',
  projected_shin_foot_relation: 'projected_shin_foot_relation',
} as const;

export type CanonicalMetricId = keyof typeof CANONICAL_METRIC_IDS;

/**
 * Read-only Kompatibilitätsadapter: Legacy → Kanonisch.
 * REGELN:
 * - Nur lesend verwenden
 * - Niemals Legacy-ID in neuen Dateien/Verträgen benutzen
 * - Neue Dateien verwenden ausschließlich CanonicalMetricId
 */
export const LEGACY_METRIC_ALIASES = {
  pelvicTilt: 'projected_hip_line_obliquity',
  CoG: 'projected_torso_center_proxy',
  weightDistribution: 'projected_trunk_position_between_ankles',
  turnout: 'projected_foot_axis_angle',
  sickleWing: 'projected_shin_foot_relation',
} as const;

export type LegacyMetricId = keyof typeof LEGACY_METRIC_ALIASES;

/** Fachlich korrekte deutsche UI-Bezeichnungen (Phase 1) */
export const METRIC_UI_LABELS: Record<CanonicalMetricId, string> = {
  projected_hip_line_obliquity: 'Hüftlinien-Neigung (projiziert)',
  projected_torso_center_proxy: 'Rumpf-Schwerpunkt-Proxy (projiziert)',
  projected_trunk_position_between_ankles: 'Rumpfposition zwischen Knöcheln (projiziert)',
  projected_foot_axis_angle: 'Fußachsen-Winkel (projiziert)',
  projected_shin_foot_relation: 'Schienbein-Fuß-Relation (projiziert)',
};

/**
 * Resolve: Legacy-ID → Kanonische ID.
 * Gibt die kanonische ID zurück, oder den Original-String wenn nicht bekannt.
 */
export function resolveMetricId(id: string): CanonicalMetricId | string {
  const legacy = LEGACY_METRIC_ALIASES as Record<string, string>;
  if (id in legacy) return legacy[id] as CanonicalMetricId;
  // Schon kanonisch?
  if (id in CANONICAL_METRIC_IDS) return id as CanonicalMetricId;
  return id;
}

/**
 * Reverse-Resolve: Kanonische ID → Legacy-ID (für Kompatibilität mit bestehenden Dateien).
 */
export function toLegacyId(canonical: CanonicalMetricId): LegacyMetricId | null {
  for (const [legacy, canon] of Object.entries(LEGACY_METRIC_ALIASES)) {
    if (canon === canonical) return legacy as LegacyMetricId;
  }
  return null;
}
