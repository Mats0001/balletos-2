/**
 * heuristicStabilizer.ts — Anti-Flicker-System für Lehrer-Ampelfarben
 *
 * Berater-Architekturanweisung 2026-08-11:
 *
 * "Farbwechsel benötigen zeitliche Stabilisierung, Hysterese und Mindesthaltezeit."
 *
 * Drei getrennte Aktualisierungszyklen:
 *   1. captureCapabilityTier  → sitzungsstabil (A/B/C), NIE frameweise
 *   2. frameEvidenceState     → pro Frame (valid/late/missing)
 *   3. teacherHeuristicState  → zeitlich stabilisiert (dieser Service)
 *
 * REGELN:
 * - Farbe ändert sich erst nach MEHREREN konsistenten Beobachtungen
 * - Mindesthaltezeit: Eine Farbe muss mindestens X ms angezeigt werden
 * - Hysterese: Wechsel von Grün→Orange braucht mehr Evidenz als Orange→Grün
 * - Messrauschen darf NICHT Grün-Gelb-Grün-Blinken erzeugen
 * - Kurze Trackinglücken → Farbe hält (intern: evidence=missing)
 *
 * TIER B Spezialregel:
 * - Während Playback: neutrales Skeleton, KEINE Ampelfarben
 * - Bei Pause: Stabiler Snapshot → Ampel EINMALIG berechnen → bleibt stehen
 *
 * TIER C:
 * - Kein Skeleton, ruhiger Hinweis "Skeleton derzeit nicht verfügbar"
 */

import type { TeacherHeuristicState, TeacherOverlayPacket } from '../types/teacherHeuristic';
import type { FrameClockCapability } from '../types/frameContracts';

// ─── KONFIGURATION ──────────────────────────────────────────────────────────

/** Mindesthaltezeit einer Farbe in Millisekunden */
const MIN_HOLD_TIME_MS = 800;

/** 
 * Anzahl konsistenter Beobachtungen bevor ein Farbwechsel durchgeführt wird.
 * Verhindert Flackern bei kurzen Messrauschen.
 */
const MIN_CONSISTENT_OBSERVATIONS = 3;

/**
 * Hysterese-Asymmetrie:
 * - Verschlechterung (grün→gelb, gelb→rot): schneller (weniger Beobachtungen)
 * - Verbesserung (rot→gelb, gelb→grün): langsamer (mehr Beobachtungen)
 */
const OBSERVATIONS_FOR_DEGRADATION = 2;
const OBSERVATIONS_FOR_IMPROVEMENT = 4;

/** Schweregrad-Ordnung für Hysterese-Richtung */
const SEVERITY_ORDER: Record<TeacherHeuristicState, number> = {
  'heuristic_match': 0,
  'heuristic_attention': 1,
  'heuristic_strong_attention': 2,
  'blocked': -1, // Sonderfall: sofort anwenden
};

// ─── BODY REGION KEYS ───────────────────────────────────────────────────────

/** Alle Körperbereich-Keys im TeacherOverlayPacket */
const BODY_REGION_KEYS = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
] as const;

type BodyRegionKey = typeof BODY_REGION_KEYS[number];

// ─── PER-REGION STABILIZER STATE ────────────────────────────────────────────

interface RegionStabilizerState {
  /** Aktuell angezeigte (stabile) Farbe */
  displayedState: TeacherHeuristicState;
  /** Zeitpunkt der letzten Farbänderung */
  lastChangeMs: number;
  /** Kandidat für die nächste Farbe (wenn sich die Messung ändert) */
  candidateState: TeacherHeuristicState | null;
  /** Anzahl konsistenter Beobachtungen des Kandidaten */
  candidateCount: number;
}

// ─── HEURISTIC STABILIZER ───────────────────────────────────────────────────

/**
 * Stabilisiert TeacherOverlayPacket-Farben mit Hysterese und Mindesthaltezeit.
 *
 * Verwendung:
 *   1. Engine berechnet rohes Packet (sofort, jede Frame)
 *   2. Stabilizer glättet die Farben (zeitlich verzögert)
 *   3. Renderer zeigt nur stabilisierte Farben
 */
export class HeuristicStabilizer {
  private regions: Map<BodyRegionKey, RegionStabilizerState> = new Map();
  private _isPaused = false;
  private _tierBSnapshotTaken = false;
  private _tierBFrozenPacket: TeacherOverlayPacket | null = null;

  constructor() {
    // Alle Regionen mit 'blocked' initialisieren (sicher: nie auto-grün)
    for (const key of BODY_REGION_KEYS) {
      this.regions.set(key, {
        displayedState: 'blocked',
        lastChangeMs: 0,
        candidateState: null,
        candidateCount: 0,
      });
    }
  }

  /**
   * Stabilisiert ein rohes TeacherOverlayPacket.
   *
   * @param raw  Rohes Packet direkt aus der Engine
   * @param tier Aktueller Capability-Tier (sitzungsstabil)
   * @returns    Stabilisiertes Packet für den Renderer
   */
  stabilize(
    raw: TeacherOverlayPacket,
    tier: FrameClockCapability,
  ): TeacherOverlayPacket {
    const now = performance.now();

    // ── Tier C: Kein Overlay ─────────────────────────────────────────
    if (tier === 'unavailable') {
      return raw; // Alles blocked, Renderer zeigt ruhigen Hinweis
    }

    // ── Tier B: Neutrales Skeleton während Playback ──────────────────
    if (tier === 'approximate_media_clock') {
      if (!this._isPaused) {
        // Playback: KEINE Ampelfarben, alles blocked (neutrales Skeleton)
        // Reset Snapshot-Flag damit bei nächster Pause neu berechnet wird
        this._tierBSnapshotTaken = false;
        this._tierBFrozenPacket = null;
        return this.createAllBlockedFrom(raw);
      }

      // Pausiert: Einmalig Snapshot nehmen, dann einfrieren
      if (!this._tierBSnapshotTaken) {
        // Erster Frame nach Pause: Stabilisieren und einfrieren
        const stabilized = this.stabilizeRegions(raw, now);
        this._tierBFrozenPacket = stabilized;
        this._tierBSnapshotTaken = true;
        return stabilized;
      }

      // Bereits eingefroren: Frozen Packet zurückgeben
      return this._tierBFrozenPacket ?? raw;
    }

    // ── Tier A: Volle Stabilisierung ─────────────────────────────────
    return this.stabilizeRegions(raw, now);
  }

  /**
   * Informiert den Stabilizer über Play/Pause-Zustandswechsel.
   * Wichtig für Tier B: Neutral bei Playback, Snapshot bei Pause.
   */
  setPlaybackState(isPaused: boolean): void {
    this._isPaused = isPaused;
    if (!isPaused) {
      // Playback gestartet: Snapshot invalidieren
      this._tierBSnapshotTaken = false;
      this._tierBFrozenPacket = null;
    }
  }

  /** Reset bei Video-Wechsel oder Seek */
  reset(): void {
    for (const key of BODY_REGION_KEYS) {
      this.regions.set(key, {
        displayedState: 'blocked',
        lastChangeMs: 0,
        candidateState: null,
        candidateCount: 0,
      });
    }
    this._tierBSnapshotTaken = false;
    this._tierBFrozenPacket = null;
  }

  // ─── INTERNE STABILISIERUNG ─────────────────────────────────────────

  private stabilizeRegions(
    raw: TeacherOverlayPacket,
    nowMs: number,
  ): TeacherOverlayPacket {
    const result = { ...raw };

    for (const key of BODY_REGION_KEYS) {
      const rawState = raw[key] as TeacherHeuristicState;
      const region = this.regions.get(key)!;
      const stabilized = this.stabilizeRegion(region, rawState, nowMs);
      (result as Record<string, unknown>)[key] = stabilized;
    }

    return result;
  }

  private stabilizeRegion(
    region: RegionStabilizerState,
    rawState: TeacherHeuristicState,
    nowMs: number,
  ): TeacherHeuristicState {
    // Blocked wird SOFORT angewendet (Evidenzmangel → nie verzögern)
    if (rawState === 'blocked') {
      // Auch blocked braucht Mindesthaltezeit für die VORHERIGE Farbe
      const timeSinceChange = nowMs - region.lastChangeMs;
      if (timeSinceChange < MIN_HOLD_TIME_MS && region.displayedState !== 'blocked') {
        return region.displayedState; // Alte Farbe noch halten
      }
      region.displayedState = 'blocked';
      region.lastChangeMs = nowMs;
      region.candidateState = null;
      region.candidateCount = 0;
      return 'blocked';
    }

    // Gleiche Farbe wie aktuell angezeigt → Kandidat zurücksetzen
    if (rawState === region.displayedState) {
      region.candidateState = null;
      region.candidateCount = 0;
      return region.displayedState;
    }

    // Mindesthaltezeit prüfen
    const timeSinceChange = nowMs - region.lastChangeMs;
    if (timeSinceChange < MIN_HOLD_TIME_MS) {
      return region.displayedState; // Noch nicht wechseln
    }

    // Neue Farbe als Kandidat zählen
    if (region.candidateState === rawState) {
      region.candidateCount++;
    } else {
      // Anderer Kandidat → Reset
      region.candidateState = rawState;
      region.candidateCount = 1;
    }

    // Hysterese: Verschlechterung braucht weniger Bestätigungen
    const currentSeverity = SEVERITY_ORDER[region.displayedState] ?? 0;
    const candidateSeverity = SEVERITY_ORDER[rawState] ?? 0;
    const isDegradation = candidateSeverity > currentSeverity;
    const requiredCount = isDegradation
      ? OBSERVATIONS_FOR_DEGRADATION
      : OBSERVATIONS_FOR_IMPROVEMENT;

    if (region.candidateCount >= requiredCount) {
      // Genug konsistente Beobachtungen → Farbwechsel durchführen
      region.displayedState = rawState;
      region.lastChangeMs = nowMs;
      region.candidateState = null;
      region.candidateCount = 0;
    }

    return region.displayedState;
  }

  /** Erzeugt ein Packet wo alle Körperbereiche blocked sind (für Tier B Playback) */
  private createAllBlockedFrom(source: TeacherOverlayPacket): TeacherOverlayPacket {
    const result = { ...source };
    for (const key of BODY_REGION_KEYS) {
      (result as Record<string, unknown>)[key] = 'blocked';
    }
    return result;
  }
}

/** Singleton */
export const heuristicStabilizer = new HeuristicStabilizer();
