// ─────────────────────────────────────────────────────────────────────────────
// VaganovaPreAnalyzer – Cue-Point Management Service
//
import { vaganovaAngleCalculator } from './vaganovaAngleCalculator';
import { vaganovaFrameCache } from './vaganovaFrameCache';

// ⚠️  AUDIT FIX (2026-08-10): Previous version faked AI analysis by switching
//     on video filename and returning fabricated angle values (14°, 88°, 8°)
//     as if they were real measurements. This has been corrected:
//
//     - DEMO_FIXTURE cue points exist only for two known demo videos
//       and are clearly tagged { isDemoFixture: true, dataSource: 'DEMO_FIXTURE' }
//     - For any unknown video: getCuePoints() returns [] (no fabricated data)
//     - Teachers add real cue points manually via addCuePoint()
//     - All teacher-created data is tagged dataSource: 'TEACHER_CREATED'
//
//     This service does NOT perform frame analysis or biomechanical measurement.
// ─────────────────────────────────────────────────────────────────────────────

export interface VaganovaCuePoint {
  id: string;
  timeSeconds: number;
  timecodeStr: string;
  poseName: string;
  status: 'GOOD' | 'CORRECTION' | 'WARNING';
  scorePercent?: number;        // Only set by teacher, never auto-generated
  headline: string;
  cueMetaphor: string;
  jointFocusId: string;
  isCustom?: boolean;
  isEdited?: boolean;
  isDemoFixture?: boolean;      // TRUE = demo placeholder, NOT a real measurement
  dataSource?: 'TEACHER_CREATED' | 'DEMO_FIXTURE' | 'KI_AUTO';
  kiNote?: string;              // KI-generierter Hinweis (nur bei KI_AUTO)
  referenceImageKey?: string;   // Key für Referenz-SVG in /public/reference/
}

export interface AutoAnalysisReport {
  strengths: Array<{ label: string; value: string }>;
  corrections: Array<{ label: string; timecode: string; value: string }>;
  durationSec: number;
  framesAnalyzed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO FIXTURES – Example cue points for two known demo videos
// These are NOT measurements. They are teacher-authored example annotations
// for UI demonstration purposes only.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_FIXTURES: Record<string, VaganovaCuePoint[]> = {
  'IMG_2272': [
    {
      id: 'demo-1-grand-plie',
      timeSeconds: 0.8,
      timecodeStr: '00:00.800',
      poseName: 'Grand Plié 2. Position (Ansatz)',
      status: 'GOOD',
      headline: 'Perfekte Beckenaufrichtung (Vaganova 2. Pos)',
      cueMetaphor: '"Lendenwirbel lang und neutral wie eine Perlenkette halten."',
      jointFocusId: 'pelvis_core',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
    },
    {
      id: 'demo-2-plie-tiefpunkt',
      timeSeconds: 2.5,
      timecodeStr: '00:02.500',
      poseName: 'Plié Tiefpunkt (Fersen am Boden)',
      status: 'CORRECTION',
      headline: 'Rechtes Knie – Ausrichtung über Zehenspitze prüfen',
      cueMetaphor: '"Die Knie ziehen aktiv zurück zur hinteren Raumdiagonale."',
      jointFocusId: 'right_knee',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
    },
  ],
};

function getDemoFixtureKey(videoUrl: string): string | null {
  for (const key of Object.keys(DEMO_FIXTURES)) {
    if (videoUrl.includes(key)) return key;
  }
  return null;
}

export class VaganovaPreAnalyzerService {
  private getStorageKey(videoUrl: string): string {
    // v2_ prefix to avoid collisions with old fabricated data in localStorage
    return `balletos_cuepoints_v2_${encodeURIComponent(videoUrl)}`;
  }

  /**
   * Returns cue points for a video.
   * Priority: 1) Teacher-saved data, 2) DEMO_FIXTURE for known demos, 3) []
   */
  public getCuePoints(videoUrl: string): VaganovaCuePoint[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey(videoUrl));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[VaganovaPreAnalyzer] Storage read error:', e);
    }

    const fixtureKey = getDemoFixtureKey(videoUrl);
    if (fixtureKey) {
      return DEMO_FIXTURES[fixtureKey];
    }

    // Unknown video: no fabricated data. Teacher must add cue points manually.
    return [];
  }

  public saveCuePoints(videoUrl: string, points: VaganovaCuePoint[]): void {
    try {
      localStorage.setItem(this.getStorageKey(videoUrl), JSON.stringify(points));
    } catch (e) {
      console.warn('[VaganovaPreAnalyzer] Storage write error:', e);
    }
  }

  public addCuePoint(videoUrl: string, newCue: Omit<VaganovaCuePoint, 'id'>): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const cue: VaganovaCuePoint = {
      ...newCue,
      id: `teacher-${Date.now()}`,
      isCustom: true,
      dataSource: 'TEACHER_CREATED',
    };
    const updated = [...points, cue].sort((a, b) => a.timeSeconds - b.timeSeconds);
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public updateCuePoint(videoUrl: string, cueId: string, updates: Partial<VaganovaCuePoint>): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const updated = points.map(p => {
      if (p.id === cueId) {
        return { ...p, ...updates, isEdited: true, dataSource: 'TEACHER_CREATED' as const };
      }
      return p;
    });
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public deleteCuePoint(videoUrl: string, cueId: string): VaganovaCuePoint[] {
    const points = this.getCuePoints(videoUrl);
    const updated = points.filter(p => p.id !== cueId);
    this.saveCuePoints(videoUrl, updated);
    return updated;
  }

  public resetToDefaults(videoUrl: string): VaganovaCuePoint[] {
    try { localStorage.removeItem(this.getStorageKey(videoUrl)); } catch (e) {}
    const fixtureKey = getDemoFixtureKey(videoUrl);
    return fixtureKey ? DEMO_FIXTURES[fixtureKey] : [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-ANALYSE ENGINE
// Analysiert alle gecachten Frames und generiert KI-Cue-Points + Report.
// Basiert auf echten Messwerten aus vaganovaAngleCalculator.analyzeFullFrame().
// KEINE Demo-Werte, KEINE Fabrication.
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

export function analyzeFrameCacheForHighlights(videoUrl: string): {
  autoCuePoints: VaganovaCuePoint[];
  report: AutoAnalysisReport;
} {
  const frames = vaganovaFrameCache.getFrames(videoUrl);
  if (frames.length < 5) {
    return { autoCuePoints: [], report: { strengths: [], corrections: [], durationSec: 0, framesAnalyzed: 0 } };
  }

  type FrameScore = { timeMs: number; timeSec: number; value: number };

  // Tracking vars per metric
  let worstKnee: FrameScore | null = null;      // max |valgusDrift| = schlechtestes Knie
  let worstArm: FrameScore | null = null;        // max arm line deviation
  let bestShoulder: FrameScore | null = null;    // closest to 180° = am horizontalsten
  let bestCoG: FrameScore | null = null;         // min |plumbDeviation| = bestes Gleichgewicht
  let bestMoment: FrameScore | null = null;      // frame with most OK metrics combined

  // Sample every Nth frame for performance (max 60 frames analyzed)
  const step = Math.max(1, Math.floor(frames.length / 60));

  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i];
    const timeSec = f.timeMs / 1000;
    const lm = f.landmarks;
    if (!lm || lm.length < 33) continue;

    const analysis = vaganovaAngleCalculator.analyzeFullFrame(lm);

    // Worst knee (valgus drift)
    const kneeL = analysis.valgusDriftL?.value;
    const kneeR = analysis.valgusDriftR?.value;
    const kneeWorst = Math.max(Math.abs(kneeL ?? 0), Math.abs(kneeR ?? 0));
    if (kneeWorst > 0 && (!worstKnee || kneeWorst > worstKnee.value)) {
      worstKnee = { timeMs: f.timeMs, timeSec, value: kneeWorst };
    }

    // Worst arm line
    const armL = analysis.armLineQualityL?.value;
    const armR = analysis.armLineQualityR?.value;
    const armWorst = Math.max(Math.abs((armL ?? 180) - 180), Math.abs((armR ?? 180) - 180));
    if (!worstArm || armWorst > worstArm.value) {
      worstArm = { timeMs: f.timeMs, timeSec, value: armWorst };
    }

    // Best shoulder (closest to 180°)
    const shoulder = analysis.shoulderSymmetry?.value;
    if (shoulder !== undefined && shoulder !== null) {
      const shoulderGoodness = 180 - Math.abs(shoulder - 180);
      if (!bestShoulder || shoulderGoodness > bestShoulder.value) {
        bestShoulder = { timeMs: f.timeMs, timeSec, value: shoulderGoodness };
      }
    }

    // Best CoG (least plumb deviation)
    const cog = analysis.plumbDeviation?.value;
    if (cog !== undefined && cog !== null) {
      const cogGoodness = 100 - Math.abs(cog);
      if (!bestCoG || cogGoodness > bestCoG.value) {
        bestCoG = { timeMs: f.timeMs, timeSec, value: cogGoodness };
      }
    }
  }

  const autoCuePoints: VaganovaCuePoint[] = [];
  const corrections: AutoAnalysisReport['corrections'] = [];
  const strengths: AutoAnalysisReport['strengths'] = [];

  // ── KORREKTUREN ──────────────────────────────────────────────────────────
  if (worstKnee && worstKnee.value > 3) {
    const timeSec = worstKnee.timeSec;
    autoCuePoints.push({
      id: `ki-knee-${Date.now()}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Knie-Alignment (KI erkannt)',
      status: 'CORRECTION',
      headline: `Knie-Einfallen ${worstKnee.value.toFixed(1)}° – stärkster Moment`,
      cueMetaphor: '"Die Knie zeigen aktiv nach außen – wie zwei Scheinwerfer, die seitlich leuchten."',
      jointFocusId: 'left_knee',
      dataSource: 'KI_AUTO',
      kiNote: `Maximale Knieachsen-Abweichung von ${worstKnee.value.toFixed(1)}° an diesem Frame. Vaganova-Standard: Knie exakt über Zehen, in der Verlängerung des Fußes.`,
      referenceImageKey: 'plie_knie_korrekt',
    });
    corrections.push({ label: 'Knie-Einfallen', timecode: fmtTime(timeSec), value: `${worstKnee.value.toFixed(1)}°` });
  }

  if (worstArm && worstArm.value > 10) {
    const timeSec = worstArm.timeSec;
    autoCuePoints.push({
      id: `ki-arm-${Date.now() + 1}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Arm-Linienführung (KI erkannt)',
      status: 'CORRECTION',
      headline: `Arm-Linie ${worstArm.value.toFixed(0)}° Abweichung`,
      cueMetaphor: '"Der Arm ist eine gerade Linie vom Schulterblatt bis zur Fingerspitze – kein Knick im Handgelenk."',
      jointFocusId: 'left_elbow',
      dataSource: 'KI_AUTO',
      kiNote: `Arm-Winkel weicht ${worstArm.value.toFixed(0)}° vom Vaganova-Ideal ab. Ellbogen leicht nach hinten-unten rotieren, Handgelenk verlängern.`,
      referenceImageKey: 'port_de_bras_ideal',
    });
    corrections.push({ label: 'Arm-Linienführung', timecode: fmtTime(timeSec), value: `${worstArm.value.toFixed(0)}°` });
  }

  // ── STÄRKEN ───────────────────────────────────────────────────────────────
  if (bestShoulder && bestShoulder.value > 150) {
    const timeSec = bestShoulder.timeSec;
    autoCuePoints.push({
      id: `ki-shoulder-good-${Date.now() + 2}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Schulter-Horizontalität (KI erkannt)',
      status: 'GOOD',
      headline: 'Gute Schulter-Horizontalität an diesem Frame',
      cueMetaphor: '"Die Schultern sind eine ruhige Horizontlinie – wie ein Tablett, das man balanciert."',
      jointFocusId: 'shoulder_line',
      dataSource: 'KI_AUTO',
      kiNote: 'Schultern nahezu parallel zum Boden – das ist die Vaganova-Standardposition für épaulement.',
      referenceImageKey: 'epaulement_ideal',
    });
    strengths.push({ label: 'Schulter-Horizontalität', value: `${(bestShoulder.value).toFixed(0)}%` });
  }

  if (bestCoG && bestCoG.value > 80) {
    strengths.push({ label: 'Körperschwerpunkt über Standfläche', value: 'Stabil' });
  }

  // Sort by time
  autoCuePoints.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const report: AutoAnalysisReport = {
    strengths,
    corrections,
    durationSec: frames.length > 0 ? frames[frames.length - 1].timeMs / 1000 : 0,
    framesAnalyzed: Math.ceil(frames.length / step),
  };

  return { autoCuePoints, report };
}

export const vaganovaPreAnalyzer = new VaganovaPreAnalyzerService();
