/**
 * frameGeometry.ts
 *
 * Berater-Briefing 2026-08-11:
 * - Kein 1×1 Fallback erlaubt
 * - videoWidth === 0 ist ein normaler temporärer Zustand (Laden)
 * - Darf NICHT die gesamte Oberfläche durch ungefangene Exception abbrechen
 * - Bei ok: false → metrics: [], overlay: blocked, reviewOnly: true
 */

import type { FrameGeometryResult, FrameGeometry } from '../types/frameContracts';

/**
 * Validiert die aktuelle Video-Geometrie.
 * 
 * Gibt `{ ok: false }` zurück wenn:
 * - Video-Metadaten noch nicht geladen (videoWidth === 0)
 * - Ungültige Dimensionen (< 10px)
 * 
 * Gibt `{ ok: true, geometry }` zurück wenn valide.
 * 
 * NIEMALS 1×1 Fallback oder geraten Werte!
 */
export function validateFrameGeometry(
  video: HTMLVideoElement
): FrameGeometryResult {
  const { videoWidth, videoHeight } = video;

  // Normaler temporärer Zustand: Video lädt noch
  if (videoWidth === 0 || videoHeight === 0) {
    return { ok: false, reason: 'metadata_not_ready' };
  }

  // Ungültige Dimensionen (z.B. korruptes Video)
  if (videoWidth < 10 || videoHeight < 10) {
    return { ok: false, reason: 'invalid_dimensions' };
  }

  const geometry: FrameGeometry = {
    videoWidth,
    videoHeight,
    displayWidth: video.clientWidth || videoWidth,
    displayHeight: video.clientHeight || videoHeight,
    geometryId: `${videoWidth}x${videoHeight}`,
  };

  return { ok: true, geometry };
}

/**
 * Erzeugt eine Geometry-ID als Hash für Change-Detection.
 * Format: `${width}x${height}`
 */
export function makeGeometryId(width: number, height: number): string {
  return `${width}x${height}`;
}
