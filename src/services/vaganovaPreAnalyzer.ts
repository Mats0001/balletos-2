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

  // ── PROVENANCE & REVIEW (PROJECT_DECISION 2026-08-10) ──────────────────────────
  // Trennt KI-Vorschlag klar von Nicoles verantworteter Entscheidung.
  // Unbestätigte KI-Vorschläge gelangen NIEMALS in Lernenden-/Elternausgaben.
  provenance?: 'ki_suggestion'     // Automatisch generiert (noch nicht bestätigt)
             | 'nicole_confirmed'  // Nicole hat bestätigt (≠ wissenschaftlich validiert)
             | 'nicole_edited'     // Nicole hat bearbeitet und übernommen
             | 'nicole_rejected';  // Abgelehnt (bleibt zur Nachvollziehbarkeit erhalten)

  nicoleAction?: 'strength' | 'correction'; // Nicoles Klassifizierung (nach Bestätigung)

  /** Für Lernenden-Output freigegeben (nur nach Nicoles expliziter Freigabe) */
  learnerVisible?: boolean;
  /** Für Eltern-Output freigegeben (nur nach Nicoles expliziter Freigabe) */
  parentVisible?: boolean;

  /** Originale KI-Daten zur Nachvollziehbarkeit (unveränderlich) */
  kiSuggestionData?: {
    originalHeadline: string;
    originalCueMetaphor: string;
    metrics: string[];          // z.B. ['spineTilt: ERROR 8.3°', 'pelvicTilt: WARNING 4.1°']
    ampelStatus: 'CORRECT' | 'WARNING' | 'ERROR';
    generatedAt: string;        // ISO 8601
    policyVersion: string;      // BUILD_POLICY.policyVersion zum Zeitpunkt der Generierung
  };

  /** Pädagogische Texte – KI-Vorschläge, von Nicole editierbar */
  diagnosisText?: string;     // Was passiert & warum (sofort verständlich, kein Fachjargon)
  diagnosisMetaphor?: string; // Bildhafte Erklärung zu Tab 1 (Was & Warum)
  goalText?: string;          // Wie es richtig aussehen soll
  practiceText?: string;      // Was konkret üben & verbessern

  /** Forensische Technik-Analyse für Nicole (Nur-Lehrer-Ansicht) */
  technicalAnalysis?: string; // Vollanalyse: Metriken, Gesamtbild, kinematische Kette, Differenzialdiagnose, Sofort-Fokus
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
      headline: 'Schöne Beckenaufrichtung – Körpermitte stabil',
      cueMetaphor: '"Stell dir vor, deine Wirbelsäule ist eine aufgefädelte Perlenkette – lang, leicht, kein Wirbel hängt durch."',
      jointFocusId: 'pelvis_core',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
      diagnosisMetaphor: '"Stell dir vor, du hast ein Wasserlas auf dem Steißbein — es darf weder nach vorne noch nach hinten kippen."',
      diagnosisText: 'Das Becken ist hier schön neutral gehalten — weder nach vorne gekippt noch hinten verklemmt. Das ist in der 2. Position gar nicht selbstverständlich, weil die breite Beinstellung viele Schüler dazu verführt, das Becken zu kippen. Hier passiert das nicht. Lendenwirbelsäule behält ihre natürliche Kurve, der Oberkörper liegt ruhig darüber. Schultern, Becken und Standfläche sind gut übereinandergestapelt — das gibt der ganzen Bewegung Stabilität und Eleganz.',
      goalText: 'Das Becken bleibt in dieser neutralen Mitte — nicht aktiv hineindrücken, nicht durch Anspannung einspannen. Die Wirbelsäule fühlt sich lang und leicht an. Diese Beckenposition als "Heimgefühl" etablieren, nicht als erzwungene Haltung. Wenn das sitzt, kann die Energie nach oben fließen: offene Brust, ruhige Schultern.',
      practiceText: 'Leg eine Hand auf den Bauchnabel, eine auf die Lendenwirbel — beim langsamen Plié spüren, ob sich die Lendenwirbel mitbewegen. Sie sollen ruhig bleiben. Sobald du das Gefühl kennst, lass die Hände weg und vertrau dem Körpergefühl. Hilfreich: Im Spiegel von der Seite schauen — ist die natürliche S-Kurve der Wirbelsäule noch da?',
    },
    {
      id: 'demo-2-plie-tiefpunkt',
      timeSeconds: 2.5,
      timecodeStr: '00:02.500',
      poseName: 'Plié Tiefpunkt',
      status: 'CORRECTION',
      headline: 'Rechtes Knie kippt nach innen – Außenrotation halten',
      cueMetaphor: '"Beide Knie sind wie zwei Türen, die gleichzeitig aufgehen — beide nach außen, keine fällt nach innen zu."',
      jointFocusId: 'right_knee',
      isDemoFixture: true,
      dataSource: 'DEMO_FIXTURE',
      diagnosisMetaphor: '"Schau auf dein Knie im Spiegel: Zeigt es nach vorne über den Zeh — oder biegt es sich nach innen weg wie eine einknicke Brücke?"',
      diagnosisText: 'Am tiefsten Punkt des Plié kippt das rechte Knie nach innen — das sieht man deutlich, wenn man auf die Linie Hüfte–Knie–Zehenspitze schaut: sie bricht am Knie ein. Das passiert, weil die kurze Hüftmuskulatur (die Außenrotatoren) an diesem Punkt die Rotation nicht mehr aktiv hält. Kein Aufmerksamkeitsfehler — die Muskeln brauchen einfach noch mehr Trainingszeit. Positiv: Oberkörper und linke Seite sehen sehr ordentlich aus!',
      goalText: 'Das Knie bleibt direkt über dem mittleren Zeh — beim Plié hinunter aktiv nach außen öffnen, als würden die Knie zwei Türen aufdrücken. Die ganze Beinlinie von Hüfte bis Zehenspitze bleibt sauber in einer Ebene. Dabei die Ferse am Boden lassen — das Knie gibt nach außen nach, nicht die Ferse nach oben.',
      practiceText: 'Erst an der Stange, nur demi-plié: im tiefsten Punkt kurz stoppen, in den Spiegel schauen — ist das Knie über dem Zeh? Dann aktiv nach außen drücken, als ob du den Boden mit den Fußsohlen auseinanderschieben willst. Fühl wie die Muskeln außen an der Hüfte arbeiten. 10 Wiederholungen täglich, langsam. Erst wenn das sicher sitzt, kommt das Grand Plié dazu. Das ist ein Kraft-Thema, kein Talent-Thema.',
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
    let points: VaganovaCuePoint[] = [];
    try {
      const stored = localStorage.getItem(this.getStorageKey(videoUrl));
      if (stored) {
        points = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[VaganovaPreAnalyzer] Storage read error:', e);
    }

    if (points.length === 0) {
      const fixtureKey = getDemoFixtureKey(videoUrl);
      if (fixtureKey) {
        return DEMO_FIXTURES[fixtureKey];
      }
      return [];
    }

    // ── DEDUP: Bereinige alte KI_AUTO-Duplikate ──────────────────────────
    // Vor dem Fix hatten KI_AUTO-IDs Date.now() → bei jedem Scan neue IDs,
    // Duplikate wurden nicht erkannt. Jetzt: pro (dataSource=KI_AUTO + timeSec)
    // nur den letzten Eintrag behalten.
    const seen = new Map<string, number>(); // key → index
    const cleaned: VaganovaCuePoint[] = [];
    for (const p of points) {
      if (p.dataSource === 'KI_AUTO') {
        const dedupeKey = `${p.jointFocusId}:${p.timeSeconds.toFixed(3)}`;
        const existing = seen.get(dedupeKey);
        if (existing !== undefined) {
          // Ersetze älteren Eintrag mit neuerem
          cleaned[existing] = p;
          continue;
        }
        seen.set(dedupeKey, cleaned.length);
      }
      cleaned.push(p);
    }

    // Wenn wir Duplikate entfernt haben, sofort persistieren
    if (cleaned.length < points.length) {
      console.info(`[VaganovaPreAnalyzer] Bereinigt: ${points.length - cleaned.length} KI_AUTO-Duplikate entfernt`);
      try {
        localStorage.setItem(this.getStorageKey(videoUrl), JSON.stringify(cleaned));
      } catch (e) { /* ignore */ }
    }

    return cleaned;
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
  const { vw, vh } = vaganovaFrameCache.getVideoDimensions(videoUrl);
  if (frames.length < 5) {
    return { autoCuePoints: [], report: { strengths: [], corrections: [], durationSec: 0, framesAnalyzed: 0 } };
  }

  type FrameScore = { timeMs: number; timeSec: number; value: number; side?: 'L' | 'R' };

  // ── Tracking per metric ──────────────────────────────────────────────────
  let worstKneeL: FrameScore | null = null;     // max |valgusDriftL|
  let worstKneeR: FrameScore | null = null;     // max |valgusDriftR|
  let worstArm: FrameScore | null = null;        // max arm line deviation
  let worstSpine: FrameScore | null = null;      // max |spineTilt|
  let worstPelvis: FrameScore | null = null;     // max |pelvicTilt|
  let bestShoulder: FrameScore | null = null;    // closest to 180° = am horizontalsten
  let bestCoG: FrameScore | null = null;         // min |plumbDeviation| = bestes Gleichgewicht
  let bestMoment: FrameScore | null = null;      // frame with most OK metrics combined

  // Sample every Nth frame for performance (max 60 frames analyzed)
  const step = Math.max(1, Math.floor(frames.length / 60));
  let analyzedCount = 0;

  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i];
    const timeSec = f.timeMs / 1000;
    const lm = f.landmarks;
    if (!lm || lm.length < 33) continue;
    analyzedCount++;

    const analysis = vaganovaAngleCalculator.analyzeFullFrame(lm, vw, vh);

    // ── Worst knee valgus (per side) ──────────────────────────────────────
    const kneeL = analysis.valgusDriftL?.value;
    if (kneeL !== undefined && kneeL !== null) {
      const kAbs = Math.abs(kneeL);
      if (!worstKneeL || kAbs > worstKneeL.value) {
        worstKneeL = { timeMs: f.timeMs, timeSec, value: kAbs, side: 'L' };
      }
    }
    const kneeR = analysis.valgusDriftR?.value;
    if (kneeR !== undefined && kneeR !== null) {
      const kAbs = Math.abs(kneeR);
      if (!worstKneeR || kAbs > worstKneeR.value) {
        worstKneeR = { timeMs: f.timeMs, timeSec, value: kAbs, side: 'R' };
      }
    }

    // ── Worst arm line ──────────────────────────────────────────────────
    const armL = analysis.armLineQualityL?.value;
    const armR = analysis.armLineQualityR?.value;
    const armWorst = Math.max(Math.abs((armL ?? 180) - 180), Math.abs((armR ?? 180) - 180));
    if (!worstArm || armWorst > worstArm.value) {
      worstArm = { timeMs: f.timeMs, timeSec, value: armWorst };
    }

    // ── Worst spine tilt ─────────────────────────────────────────────────
    const spine = analysis.spineTilt?.value;
    if (spine !== undefined && spine !== null) {
      const sAbs = Math.abs(spine);
      if (!worstSpine || sAbs > worstSpine.value) {
        worstSpine = { timeMs: f.timeMs, timeSec, value: sAbs };
      }
    }

    // ── Worst pelvic tilt ────────────────────────────────────────────────
    const pelvis = analysis.pelvicTilt?.value;
    if (pelvis !== undefined && pelvis !== null) {
      const pAbs = Math.abs(pelvis);
      if (!worstPelvis || pAbs > worstPelvis.value) {
        worstPelvis = { timeMs: f.timeMs, timeSec, value: pAbs };
      }
    }

    // ── Best shoulder (closest to 180°) ──────────────────────────────────
    const shoulder = analysis.shoulderSymmetry?.value;
    if (shoulder !== undefined && shoulder !== null) {
      const shoulderGoodness = 180 - Math.abs(shoulder - 180);
      if (!bestShoulder || shoulderGoodness > bestShoulder.value) {
        bestShoulder = { timeMs: f.timeMs, timeSec, value: shoulderGoodness };
      }
    }

    // ── Best CoG (least plumb deviation) ─────────────────────────────────
    const cog = analysis.plumbDeviation?.value;
    if (cog !== undefined && cog !== null) {
      const cogGoodness = 100 - Math.abs(cog);
      if (!bestCoG || cogGoodness > bestCoG.value) {
        bestCoG = { timeMs: f.timeMs, timeSec, value: cogGoodness };
      }
    }

    // ── Best overall moment (count how many metrics are OK) ──────────────
    let okCount = 0;
    if (analysis.spineTilt && Math.abs(analysis.spineTilt.value) < 5) okCount++;
    if (analysis.pelvicTilt && Math.abs(analysis.pelvicTilt.value) < 8) okCount++;
    if (analysis.shoulderSymmetry && Math.abs(analysis.shoulderSymmetry.value - 180) < 5) okCount++;
    if (analysis.valgusDriftL && Math.abs(analysis.valgusDriftL.value) < 3) okCount++;
    if (analysis.valgusDriftR && Math.abs(analysis.valgusDriftR.value) < 3) okCount++;
    if (analysis.plumbDeviation && Math.abs(analysis.plumbDeviation.value) < 5) okCount++;
    if (!bestMoment || okCount > bestMoment.value) {
      bestMoment = { timeMs: f.timeMs, timeSec, value: okCount };
    }
  }

  // ── BUILD CANDIDATE POOLS ──────────────────────────────────────────────────
  // Each candidate has a priority (higher = more important for inclusion)

  type CueCandidate = {
    priority: number;           // Higher = more important
    category: 'CORRECTION' | 'GOOD';
    cue: VaganovaCuePoint;
    reportEntry: { label: string; value: string; timecode?: string };
  };

  const candidates: CueCandidate[] = [];

  // ── KORREKTUREN ──────────────────────────────────────────────────────────

  // Knee valgus L
  if (worstKneeL && worstKneeL.value > 3) {
    const timeSec = worstKneeL.timeSec;
    candidates.push({
      priority: worstKneeL.value * 3, // Knie-Valgus ist Gelenk-Sicherheitsthema
      category: 'CORRECTION',
      cue: {
        id: `ki-kneeL-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Linkes Knie-Alignment (KI erkannt)',
        status: 'CORRECTION',
        headline: `Linkes Knie kippt nach innen – ${worstKneeL.value.toFixed(1)}°`,
        cueMetaphor: '"Beide Knie sind wie zwei Scheinwerfer – beide zeigen gleichzeitig nach außen in den Raum."',
        jointFocusId: 'left_knee',
        dataSource: 'KI_AUTO',
        kiNote: `Linkes Knie zeigt ${worstKneeL.value.toFixed(1)}° Valgus-Drift an diesem Frame.`,
      },
      reportEntry: { label: 'Knie-Einfallen links', timecode: fmtTime(timeSec), value: `${worstKneeL.value.toFixed(1)}°` },
    });
  }

  // Knee valgus R
  if (worstKneeR && worstKneeR.value > 3) {
    const timeSec = worstKneeR.timeSec;
    candidates.push({
      priority: worstKneeR.value * 3,
      category: 'CORRECTION',
      cue: {
        id: `ki-kneeR-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Rechtes Knie-Alignment (KI erkannt)',
        status: 'CORRECTION',
        headline: `Rechtes Knie kippt nach innen – ${worstKneeR.value.toFixed(1)}°`,
        cueMetaphor: '"Beide Knie sind wie zwei Scheinwerfer – beide zeigen gleichzeitig nach außen in den Raum."',
        jointFocusId: 'right_knee',
        dataSource: 'KI_AUTO',
        kiNote: `Rechtes Knie zeigt ${worstKneeR.value.toFixed(1)}° Valgus-Drift an diesem Frame.`,
      },
      reportEntry: { label: 'Knie-Einfallen rechts', timecode: fmtTime(timeSec), value: `${worstKneeR.value.toFixed(1)}°` },
    });
  }

  // Arm line
  if (worstArm && worstArm.value > 10) {
    const timeSec = worstArm.timeSec;
    candidates.push({
      priority: worstArm.value * 1.5,
      category: 'CORRECTION',
      cue: {
        id: `ki-arm-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Arm-Linienführung (KI erkannt)',
        status: 'CORRECTION',
        headline: `Arm-Linie ${worstArm.value.toFixed(0)}° – Ellbogen oder Handgelenk prüfen`,
        cueMetaphor: '"Der Arm fließt wie ein Fluss – vom Schulterblatt bis zur Fingerspitze, ohne Staustufe dazwischen."',
        jointFocusId: 'left_elbow',
        dataSource: 'KI_AUTO',
        kiNote: `Arm-Linienführung zeigt ${worstArm.value.toFixed(0)}° Abweichung von der idealen Kurve.`,
      },
      reportEntry: { label: 'Arm-Linienführung', timecode: fmtTime(timeSec), value: `${worstArm.value.toFixed(0)}°` },
    });
  }

  // Spine tilt
  if (worstSpine && worstSpine.value > 5) {
    const timeSec = worstSpine.timeSec;
    candidates.push({
      priority: worstSpine.value * 2.5, // Wirbelsäule = zentrale Achse, hohe Priorität
      category: 'CORRECTION',
      cue: {
        id: `ki-spine-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Oberkörper-Neigung (KI erkannt)',
        status: worstSpine.value > 10 ? 'WARNING' : 'CORRECTION',
        headline: `Oberkörper neigt sich ${worstSpine.value.toFixed(1)}° zur Seite`,
        cueMetaphor: '"Stell dir vor, dein Kopf ist an einem unsichtbaren Faden aufgehängt – er zieht dich gerade nach oben."',
        jointFocusId: 'spine_center',
        dataSource: 'KI_AUTO',
        kiNote: `Die Wirbelsäule zeigt ${worstSpine.value.toFixed(1)}° seitliche Neigung. In der Vaganova-Methodik soll die Wirbelsäule eine stabile vertikale Achse bilden. Leichte Neigungen sind bei jungen Schülerinnen normal und korrigieren sich mit Kraft- und Körperwahrnehmungstraining.`,
      },
      reportEntry: { label: 'Oberkörper-Neigung', timecode: fmtTime(timeSec), value: `${worstSpine.value.toFixed(1)}°` },
    });
  }

  // Pelvic tilt
  if (worstPelvis && worstPelvis.value > 8) {
    const timeSec = worstPelvis.timeSec;
    candidates.push({
      priority: worstPelvis.value * 2, // Becken = Fundament
      category: 'CORRECTION',
      cue: {
        id: `ki-pelvis-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Beckenkippung (KI erkannt)',
        status: worstPelvis.value > 15 ? 'WARNING' : 'CORRECTION',
        headline: `Becken kippt ${worstPelvis.value.toFixed(1)}° – Neutralposition anstreben`,
        cueMetaphor: '"Stell dir vor, dein Becken ist eine Schüssel mit Wasser – kein Tropfen darf verschüttet werden."',
        jointFocusId: 'pelvis_core',
        dataSource: 'KI_AUTO',
        kiNote: `Das Becken zeigt ${worstPelvis.value.toFixed(1)}° Kippung (anterior oder lateral). In der Vaganova-Methodik soll das Becken neutral-aufrecht stehen. Häufige Ursache: schwache Gluteal- oder Bauchmuskulatur, die das Becken nicht gegen die Gravitation stabilisiert.`,
      },
      reportEntry: { label: 'Beckenkippung', timecode: fmtTime(timeSec), value: `${worstPelvis.value.toFixed(1)}°` },
    });
  }

  // ── STÄRKEN ──────────────────────────────────────────────────────────────

  if (bestShoulder && bestShoulder.value > 150) {
    const timeSec = bestShoulder.timeSec;
    candidates.push({
      priority: bestShoulder.value - 140, // 150→10, 180→40
      category: 'GOOD',
      cue: {
        id: `ki-shoulder-good-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Schulter-Horizontalität (KI erkannt)',
        status: 'GOOD',
        headline: 'Schöne ruhige Schulter-Linie – genau so soll es sein',
        cueMetaphor: '"Die Schultern sind ein Tablett, das du balancierst — kein Tropfen darf herunterfallen."',
        jointFocusId: 'shoulder_line',
        dataSource: 'KI_AUTO',
        kiNote: 'An diesem Frame sind die Schultern wirklich schön ruhig und fast perfekt parallel.',
      },
      reportEntry: { label: 'Schulter-Horizontalität', value: `${(bestShoulder.value).toFixed(0)}%` },
    });
  }

  if (bestCoG && bestCoG.value > 80) {
    const timeSec = bestCoG.timeSec;
    candidates.push({
      priority: bestCoG.value - 70, // 80→10, 100→30
      category: 'GOOD',
      cue: {
        id: `ki-cog-good-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Körperschwerpunkt-Stabilität (KI erkannt)',
        status: 'GOOD',
        headline: 'Sehr gute Schwerpunkt-Kontrolle – Stabilität über Standfläche',
        cueMetaphor: '"Stell dir vor, du hast einen Laserstrahl am Bauchnabel — er zeigt exakt zwischen deine Füße auf den Boden."',
        jointFocusId: 'pelvis_core',
        dataSource: 'KI_AUTO',
        kiNote: `Der projizierte Körperschwerpunkt liegt stabil über der Standfläche.`,
      },
      reportEntry: { label: 'Körperschwerpunkt', value: 'Stabil' },
    });
  }

  if (bestMoment && bestMoment.value >= 4) {
    const timeSec = bestMoment.timeSec;
    candidates.push({
      priority: bestMoment.value * 3, // High priority for "best overall"
      category: 'GOOD',
      cue: {
        id: `ki-best-moment-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Bester Gesamtmoment (KI erkannt)',
        status: 'GOOD',
        headline: `Bester Frame – ${bestMoment.value} von 6 Metriken im grünen Bereich`,
        cueMetaphor: '"Dieser Moment ist dein persönlicher Referenz-Frame — so sieht dein Bestes aus. Merk dir das Gefühl."',
        jointFocusId: 'pelvis_core',
        dataSource: 'KI_AUTO',
        kiNote: `An diesem Frame sind ${bestMoment.value} von 6 gemessenen Metriken gleichzeitig im grünen Bereich — das ist der beste Gesamtmoment in dieser Aufnahme.`,
      },
      reportEntry: { label: 'Bester Gesamtmoment', value: `${bestMoment.value}/6 Metriken OK` },
    });
  }

  // ── SELECT TOP 8: max 3 GOOD + max 5 CORRECTION ──────────────────────────
  const corrections = candidates
    .filter(c => c.category === 'CORRECTION')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  const goods = candidates
    .filter(c => c.category === 'GOOD')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const selected = [...corrections, ...goods];
  const autoCuePoints = selected
    .map(c => c.cue)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);

  const report: AutoAnalysisReport = {
    strengths: goods.map(c => c.reportEntry),
    corrections: corrections.map(c => ({
      label: c.reportEntry.label,
      timecode: c.reportEntry.timecode || '',
      value: c.reportEntry.value,
    })),
    durationSec: frames.length > 0 ? frames[frames.length - 1].timeMs / 1000 : 0,
    framesAnalyzed: analyzedCount,
  };

  return { autoCuePoints, report };
}

export const vaganovaPreAnalyzer = new VaganovaPreAnalyzerService();
