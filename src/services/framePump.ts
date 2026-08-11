/**
 * framePump.ts — Capability-basierter Frame-Pump
 *
 * Berater-Briefing 2026-08-11:
 * - Capability-Tier (A/B/C) wird EINMAL pro Sitzung ermittelt
 * - Tier wechselt NIEMALS frameweise
 * - Einzelne verspätete Frames lösen keinen Tierwechsel aus
 * - Downgrade erst bei anhaltendem technischen Ausfall
 * - Nach Downgrade kein automatisches Hochspringen
 *
 * Tier A: requestVideoFrameCallback — synchronisierte Frame-Metadaten
 * Tier B: requestAnimationFrame + video.currentTime — approximate
 * Tier C: unavailable — kein Overlay
 */

import type {
  FrameClockCapability,
  FrameIdentity,
  FrameEvidenceState,
} from '../types/frameContracts';

/** Ergebnis des Frame-Pump-Callbacks */
export interface FramePumpFrame {
  identity: FrameIdentity;
  evidence: FrameEvidenceState;
}

/** Callback-Typ für Frame-Pump */
export type FramePumpCallback = (frame: FramePumpFrame) => void;

/**
 * FramePump: Liefert Frames basierend auf dem Capability-Tier.
 *
 * Sitzungsstabil: Tier wird einmal beim Start ermittelt und bleibt stabil.
 * Anti-Flicker: Einzelne verspätete Frames ändern nicht den Tier.
 */
export class FramePump {
  private tier: FrameClockCapability = 'unavailable';
  private isRunning = false;
  private frameSequence = 0;
  private streamEpoch = 0;
  private sourceVideoId = '';

  // Tier A: rVFC handle
  private rvfcHandle: number | null = null;

  // Tier B: rAF handle
  private rafHandle: number | null = null;
  private lastMediaTime = -1;

  /** Aktuell ermittelter Tier */
  get currentTier(): FrameClockCapability {
    return this.tier;
  }

  /**
   * Sitzungsstabile Tier-Ermittlung.
   *
   * Runtime-Capability-Prüfung:
   * 1. typeof video.requestVideoFrameCallback === 'function'
   * 2. typeof video.cancelVideoFrameCallback === 'function'
   * 3. Laufzeitprüfung: Callback wird aufgerufen, mediaTime ist endlich
   *
   * Timeout: 500ms — wenn kein Callback kommt → Tier B.
   */
  async probeTier(video: HTMLVideoElement): Promise<FrameClockCapability> {
    // Prüfung 1+2: Funktionen vorhanden?
    if (
      typeof video.requestVideoFrameCallback !== 'function' ||
      typeof video.cancelVideoFrameCallback !== 'function'
    ) {
      this.tier = 'approximate_media_clock';
      return this.tier;
    }

    // Prüfung 3: Laufzeitprobe — Callback muss tatsächlich feuern
    try {
      const probeResult = await new Promise<FrameClockCapability>((resolve) => {
        const timeout = setTimeout(() => {
          // Timeout → rVFC ist zwar vorhanden, feuert aber nicht
          resolve('approximate_media_clock');
        }, 500);

        video.requestVideoFrameCallback((_now, metadata) => {
          clearTimeout(timeout);

          // Validierung: mediaTime muss endlich sein
          if (!isFinite(metadata.mediaTime)) {
            resolve('approximate_media_clock');
            return;
          }

          // Optional: presentedFrames sollte vorhanden sein
          if (
            'presentedFrames' in metadata &&
            typeof metadata.presentedFrames === 'number' &&
            metadata.presentedFrames >= 0
          ) {
            // Alles OK → Tier A
            resolve('presented_frame_metadata');
          } else {
            // mediaTime OK, aber kein presentedFrames → noch OK für Tier A
            resolve('presented_frame_metadata');
          }
        });
      });

      this.tier = probeResult;
    } catch {
      // Exception bei rVFC → Tier B
      this.tier = 'approximate_media_clock';
    }

    return this.tier;
  }

  /**
   * Startet Frame-Delivery basierend auf dem ermittelten Tier.
   */
  start(
    video: HTMLVideoElement,
    sourceVideoId: string,
    streamEpoch: number,
    onFrame: FramePumpCallback,
  ): void {
    this.stop();
    this.isRunning = true;
    this.sourceVideoId = sourceVideoId;
    this.streamEpoch = streamEpoch;
    this.frameSequence = 0;
    this.lastMediaTime = -1;

    if (this.tier === 'presented_frame_metadata') {
      this.startTierA(video, onFrame);
    } else if (this.tier === 'approximate_media_clock') {
      this.startTierB(video, onFrame);
    }
    // Tier C: kein Pump
  }

  /** Stoppt den Frame-Pump */
  stop(): void {
    this.isRunning = false;

    if (this.rvfcHandle !== null) {
      // rVFC hat kein cancel in allen Browsern, aber wir setzen isRunning=false
      this.rvfcHandle = null;
    }

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /** Invalidiert Stream-Epoch (bei Seek, Clipwechsel, etc.) */
  invalidateEpoch(): void {
    this.streamEpoch++;
    this.frameSequence = 0;
    this.lastMediaTime = -1;
  }

  // ─── Tier A: requestVideoFrameCallback ─────────────────────────────

  private startTierA(video: HTMLVideoElement, onFrame: FramePumpCallback): void {
    const loop = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (!this.isRunning) return;

      const evidence: FrameEvidenceState = isFinite(metadata.mediaTime) ? 'valid' : 'late';

      const identity: FrameIdentity = {
        pts: metadata.mediaTime,
        frameSequence: this.frameSequence++,
        streamEpoch: this.streamEpoch,
        sourceVideoId: this.sourceVideoId,
      };

      onFrame({ identity, evidence });

      // Nächsten Frame anfordern
      this.rvfcHandle = video.requestVideoFrameCallback(loop);
    };

    this.rvfcHandle = video.requestVideoFrameCallback(loop);
  }

  // ─── Tier B: requestAnimationFrame + video.currentTime ─────────────

  private startTierB(video: HTMLVideoElement, onFrame: FramePumpCallback): void {
    const loop = () => {
      if (!this.isRunning) return;

      const currentTime = video.currentTime;

      // Nur feuern wenn sich die Zeit tatsächlich geändert hat
      // (vermeidet Duplikate bei pausiertem Video)
      if (currentTime !== this.lastMediaTime) {
        this.lastMediaTime = currentTime;

        const identity: FrameIdentity = {
          pts: currentTime,
          frameSequence: -1, // Tier B hat keine echte Frame-Sequenz
          streamEpoch: this.streamEpoch,
          sourceVideoId: this.sourceVideoId,
        };

        onFrame({ identity, evidence: 'valid' });
      }

      this.rafHandle = requestAnimationFrame(loop);
    };

    this.rafHandle = requestAnimationFrame(loop);
  }
}

/** Singleton-Instanz */
export const framePump = new FramePump();
