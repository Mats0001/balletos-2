/**
 * Frame-Verträge für den Skeleton-Integrity Sprint.
 * Berater-Briefing 2026-08-11: Kanonische Frame-Identität, Geometrie und Capability-Tiers.
 */

/** Eindeutige Frame-Identität — niemals erfunden oder geraten */
export interface FrameIdentity {
  /** Präsentations-Zeitstempel in Sekunden (aus rVFC mediaTime oder video.currentTime) */
  pts: number;
  /** Monoton steigende Frame-Nummer (aus rVFC presentedFrames, oder -1 bei Tier B) */
  frameSequence: number;
  /** Invalidiert bei Seek, Clipwechsel, neuer Quelle */
  streamEpoch: number;
  /** Stabile Video-ID (URL oder IDB-Key) */
  sourceVideoId: string;
}

/** Validierte Geometrie — kein 1×1 Fallback erlaubt */
export type FrameGeometryResult =
  | { ok: true; geometry: FrameGeometry }
  | { ok: false; reason: 'metadata_not_ready' | 'invalid_dimensions' };

export interface FrameGeometry {
  /** Intrinsische Videobreite in Pixeln (muss > 0 sein) */
  videoWidth: number;
  /** Intrinsische Videohöhe in Pixeln (muss > 0 sein) */
  videoHeight: number;
  /** Angezeigte Breite im DOM */
  displayWidth: number;
  /** Angezeigte Höhe im DOM */
  displayHeight: number;
  /** Hash-ID: `${videoWidth}x${videoHeight}` für Geometry-Change-Detection */
  geometryId: string;
}

/**
 * Capability-Tier — sitzungsstabil, NICHT frameweise.
 * Wird einmal beim Öffnen des Videos ermittelt.
 * Ein einzelner verspäteter Frame löst keinen Tierwechsel aus.
 * Nach Downgrade kein automatisches Hochspringen — nur nach manueller Neuprüfung.
 */
export type FrameClockCapability =
  | 'presented_frame_metadata' // Tier A: rVFC verfügbar und verifiziert
  | 'approximate_media_clock' // Tier B: rAF + video.currentTime
  | 'unavailable'; // Tier C: kein Overlay

/** Frame-Evidenzstatus — pro Frame, beeinflusst Messung aber nicht Tier */
export type FrameEvidenceState = 'valid' | 'late' | 'missing';

/** Ergebnis eines Frame-Pump-Callbacks */
export interface FramePumpResult {
  identity: FrameIdentity;
  evidence: FrameEvidenceState;
  geometry: FrameGeometry;
  /** rVFC-spezifische Metadaten (nur Tier A) */
  rvfcMeta?: {
    mediaTime: number;
    presentedFrames: number;
    expectedDisplayTime: number;
    width: number;
    height: number;
  };
}

/**
 * Getrennte Aktualisierungszyklen (Anti-Flicker):
 * - captureCapabilityTier: sitzungsstabil (A/B/C)
 * - frameEvidenceState: pro Frame (valid/late/missing)
 * - teacherHeuristicState: zeitlich stabilisiert (Hysterese + Mindesthaltezeit)
 */
export interface SkeletonRuntimeState {
  captureCapabilityTier: FrameClockCapability;
  frameEvidenceState: FrameEvidenceState;
  /** Letzte stabile Heuristik (aktualisiert mit Hysterese) */
  lastStableHeuristicEpoch: number;
}
