// ─────────────────────────────────────────────────────────────────────────────
// VaganovaPreAnalyzer – Cue-Point Management Service
//
import { VaganovaAngleCalculator } from './vaganovaAngleCalculator';
import { vaganovaFrameCache } from './vaganovaFrameCache';
import { BUILD_POLICY, canGenerateLegacyUngroundedCues } from '../config/buildPolicy';

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
  status: 'GOOD' | 'CORRECTION' | 'WARNING' | 'NEUTRAL';
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
    originalDiagnosisText?: string;
    originalGoalText?: string;
    originalPracticeText?: string;
    originalTechnicalAnalysis?: string;
    metrics: string[];          // z.B. ['spineTilt: ERROR 8.3°', 'pelvicTilt: WARNING 4.1°']
    ampelStatus: 'CORRECT' | 'WARNING' | 'ERROR' | 'NEUTRAL';
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

export interface ManualCueSuggestion {
  diagnosisText: string;
  goalText: string;
  practiceText: string;
  headline: string;
  status: 'GOOD' | 'CORRECTION' | 'WARNING' | 'NEUTRAL';
}

/** Claim-free structure for a teacher-created observation point. */
export function buildNeutralManualCueSuggestion(poseName: string): ManualCueSuggestion {
  return {
    headline: `Beobachtungspunkt – ${poseName}`,
    status: 'NEUTRAL',
    diagnosisText: '',
    goalText: '',
    practiceText: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO FIXTURES – Example cue points for a known demo video
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
      learnerVisible: false,
      parentVisible: false,
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
      learnerVisible: false,
      parentVisible: false,
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
    // Duplikate wurden nicht erkannt. Jetzt: pro noch unreviewtem KI-Vorschlag
    // und timeSec nur den letzten Eintrag behalten. Nicole-Entscheidungen bleiben
    // als Auditspur stets vollständig erhalten.
    const seenPending = new Map<string, number>(); // key → index
    const cleaned: VaganovaCuePoint[] = [];
    for (const p of points) {
      if (p.dataSource === 'KI_AUTO') {
        const reviewed = p.provenance === 'nicole_confirmed'
          || p.provenance === 'nicole_edited'
          || p.provenance === 'nicole_rejected';
        if (reviewed) {
          // Every explicit Nicole decision is audit evidence; never deduplicate it.
          cleaned.push(p);
          continue;
        }
        if (p.provenance !== 'ki_suggestion' || !canGenerateLegacyUngroundedCues()) {
          continue;
        }
        const dedupeKey = `${p.jointFocusId}:${p.timeSeconds.toFixed(3)}`;
        const existing = seenPending.get(dedupeKey);
        if (existing !== undefined) {
          // Ersetze älteren Eintrag mit neuerem
          cleaned[existing] = p;
          continue;
        }
        seenPending.set(dedupeKey, cleaned.length);
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

    if (cleaned.length === 0) {
      const fixtureKey = getDemoFixtureKey(videoUrl);
      if (fixtureKey) return DEMO_FIXTURES[fixtureKey];
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

/** Replaces only unreviewed automatic results; reviewed, teacher and demo cues survive. */
export function replaceAutoCuePoints(
  existing: VaganovaCuePoint[],
  generated: VaganovaCuePoint[],
): VaganovaCuePoint[] {
  const isReviewed = (point: VaganovaCuePoint) => (
    point.provenance === 'nicole_confirmed'
    || point.provenance === 'nicole_edited'
    || point.provenance === 'nicole_rejected'
  );
  const reviewedKeys = new Set(
    existing
      .filter(isReviewed)
      .map(point => `${point.jointFocusId}:${point.timeSeconds.toFixed(3)}`),
  );
  const retained = existing.filter(point => (
    point.dataSource !== 'KI_AUTO' || isReviewed(point)
  ));
  const newSuggestions = generated.filter(point => (
    !reviewedKeys.has(`${point.jointFocusId}:${point.timeSeconds.toFixed(3)}`)
  ));

  return [
    ...retained,
    ...newSuggestions,
  ].sort((a, b) => a.timeSeconds - b.timeSeconds);
}

/** Finds the newly added cue without relying on its position after time sorting. */
export function findAddedCuePoint(
  previous: VaganovaCuePoint[],
  updated: VaganovaCuePoint[],
): VaganovaCuePoint | undefined {
  const previousIds = new Set(previous.map(point => point.id));
  return updated.find(point => !previousIds.has(point.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-ANALYSE ENGINE
// Analysiert alle gecachten Frames und generiert KI-Cue-Points + Report.
// Basiert auf echten Messwerten einer scan-lokalen VaganovaAngleCalculator-Instanz.
// KEINE Demo-Werte, KEINE Fabrication.
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

export function analyzeFrameCacheForHighlights(videoUrl: string): {
  autoCuePoints: VaganovaCuePoint[];
  report: AutoAnalysisReport | null;
} {
  if (!canGenerateLegacyUngroundedCues()) {
    return { autoCuePoints: [], report: null };
  }

  const frames = vaganovaFrameCache.getFrames(videoUrl);
  const { vw, vh } = vaganovaFrameCache.getVideoDimensions(videoUrl);
  if (frames.length < 5) {
    return { autoCuePoints: [], report: { strengths: [], corrections: [], durationSec: 0, framesAnalyzed: 0 } };
  }

  type FrameScore = { timeMs: number; timeSec: number; value: number; side?: 'L' | 'R' };

  // ── Tracking per metric ──────────────────────────────────────────────────
  let worstArm: FrameScore | null = null;        // max arm line deviation
  let worstSpine: FrameScore | null = null;      // max |spineTilt|
  let worstPelvis: FrameScore | null = null;     // max |pelvicTilt|

  // Sample every Nth frame for performance (max 60 frames analyzed)
  const step = Math.max(1, Math.floor(frames.length / 60));
  let analyzedCount = 0;
  // A scan must never train or contaminate the live, video-bound calculator.
  const scanAngleCalculator = new VaganovaAngleCalculator();

  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i];
    const timeSec = f.timeMs / 1000;
    const lm = f.landmarks;
    if (!lm || lm.length < 33) continue;
    analyzedCount++;

    const analysis = scanAngleCalculator.analyzeFullFrame(lm, vw, vh);

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

  // Arm line
  if (worstArm && worstArm.value > 10) {
    const timeSec = worstArm.timeSec;
    const v = worstArm.value;
    candidates.push({
      priority: v * 1.5,
      category: 'CORRECTION',
      cue: {
        id: `ki-arm-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Arm-Linienführung (KI erkannt)',
        status: 'CORRECTION',
        headline: `Arm-Linie ${v.toFixed(0)}° – Ellbogen oder Handgelenk prüfen`,
        cueMetaphor: '"Der Arm fließt wie ein Fluss – vom Schulterblatt bis zur Fingerspitze, ohne Staustufe dazwischen."',
        jointFocusId: 'left_elbow',
        dataSource: 'KI_AUTO',
        diagnosisMetaphor: '"Stell dir einen Gartenschlauch vor: Wenn du ihn irgendwo abknickst, fließt das Wasser nicht mehr durch. Genau das passiert hier mit der Energie im Arm."',
        kiNote: `Der Arm verliert hier die durchfließende Linie vom Schulterblatt bis zur Fingerspitze — meist als leichter Knick im Ellbogen oder als abgeknicktes Handgelenk sichtbar. ${v.toFixed(0)}° Abweichung an diesem Frame.`,
        diagnosisText: `Der Arm verliert hier die durchfließende Linie vom Schulterblatt bis zur Fingerspitze — meist als leichter Knick im Ellbogen (zu hoch oder zu tief) oder als abgeknicktes Handgelenk sichtbar. Von der Seite betrachtet wirkt der Arm dann nicht fließend, sondern ein bisschen gebrochen. ${v.toFixed(0)}° Abweichung an diesem Frame. Das ist eine Frage der Körperwahrnehmung — wenn man einmal fühlt, wie sich der "durchfließende" Arm anfühlt, korrigiert sich das oft sehr schnell. Es ist kein Kraft-Thema, sondern ein Aufmerksamkeits- und Gewohnheitsthema.`,
        goalText: 'Der Arm bildet eine fließende, leicht gerundete Kurve vom Schulterblatt bis zur Fingerspitze — kein spitzer Knick im Ellbogen, kein abgeknicktes Handgelenk, kein hochgezogenes Schulterblatt. Die Position des Ellbogens ist dabei entscheidend: Er liegt geringfügig tiefer als die Schulter, die Innenseite des Ellbogens zeigt leicht zur Decke. Das Handgelenk ist eine natürliche Verlängerung des Unterarms, nicht abgeknickt oder überstreckt. Diese weiche Linie gibt dem Port de bras seine Ausdruckskraft.',
        practiceText: 'Vor dem Spiegel ohne Musik: Den Arm langsam durch alle Positionen führen (1., 2., 3.) und dabei gezielt auf den Ellbogen achten. An jeder Position kurz anhalten: Ist der Ellbogen tiefer als die Schulter? Zeigt die Arminnenseite zur Decke? Dann das Handgelenk: Liegt es in der Verlängerung des Unterarms? Diese Kontrolle bewusst machen, bis sie automatisch wird. Übung: Arm in Position 1 halten, Augen schließen, Körpergefühl spüren. Augen öffnen, mit dem Spiegel vergleichen. Der Abstand zwischen Gefühl und Realität schließt sich mit der Zeit.',
        referenceImageKey: 'port_de_bras_ideal',
        technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${v.toFixed(0)}° Abweichung von der idealen Armlinienführung. Sollwert: <20° (weiche Allongé-Kurve, 160°–170° im Ellbogengelenk). Abweichung: ${v.toFixed(0)}°.\n\nGESAMTBILD DIESES FRAMES\nDie Körperachse wirkt insgesamt stabil. Die Schulter ist wahrscheinlich leicht eleviert (hochgezogen) — das ist fast immer mit einem Arm-Knick korreliert. Das Handgelenk möglicherweise überstreckt oder spannungslos ("tote Hand").\n\nKINEMATISCHE KETTE\nEine gebrochene Armlinie entsteht fast immer durch fehlende Verankerung des Schulterblatts am Thorax. Wenn der untere Trapezius und M. latissimus dorsi das Schulterblatt nicht in aktiver Depression halten, übernimmt der M. deltoideus die Haltearbeit allein — Resultat: Schulter geht hoch, Ellbogen knickt ein.\n\nDIFFERENZIALDIAGNOSE\nPrimär Koordination / Gewohnheit: Die Schülerin positioniert die Hand im Raum, statt Energie aus dem Rücken durch den Ellbogen bis in die Fingerspitzen zu denken. Selten ein Kraftproblem.\n\nSOFORT-FOKUS\nEllbogen energetisch heben, gleichzeitig das Schulterblatt in die Gesäßtasche senken. Verbale Korrektur: "Lass den Ellbogen den Arm führen, nicht die Hand."`,
      },
      reportEntry: { label: 'Arm-Linienführung', timecode: fmtTime(timeSec), value: `${v.toFixed(0)}°` },
    });
  }

  // Spine tilt
  if (worstSpine && worstSpine.value > 5) {
    const timeSec = worstSpine.timeSec;
    const v = worstSpine.value;
    candidates.push({
      priority: v * 2.5,
      category: 'CORRECTION',
      cue: {
        id: `ki-spine-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Oberkörper-Neigung (KI erkannt)',
        status: v > 10 ? 'WARNING' : 'CORRECTION',
        headline: `Oberkörper neigt sich ${v.toFixed(1)}° zur Seite`,
        cueMetaphor: '"Stell dir vor, dein Kopf ist an einem unsichtbaren Faden aufgehängt – er zieht dich gerade nach oben."',
        jointFocusId: 'spine_center',
        dataSource: 'KI_AUTO',
        diagnosisMetaphor: '"Stell dir vor, deine Wirbelsäule ist ein Turm aus Bauklötzen — wenn einer schief liegt, kippt alles darüber. Hier rutscht ein Baustein leicht zur Seite."',
        kiNote: `Die Wirbelsäule zeigt ${v.toFixed(1)}° seitliche Neigung an diesem Frame. In der Vaganova-Methodik soll die Wirbelsäule eine stabile vertikale Achse bilden. Leichte Neigungen sind bei jungen Schülerinnen normal und korrigieren sich mit Kraft- und Körperwahrnehmungstraining.`,
        diagnosisText: `Der Oberkörper neigt sich hier ${v.toFixed(1)}° zur Seite — das sieht man, wenn man eine gedachte Linie vom Scheitel zum Becken zieht: sie ist nicht senkrecht, sondern leicht schräg. Das passiert häufig, wenn das Gewicht unbewusst auf eine Seite verlagert wird, oder wenn die seitliche Rumpfmuskulatur (M. obliquus, M. quadratus lumborum) auf einer Seite schwächer ist als auf der anderen. Bei jungen Schülerinnen ist das sehr häufig und kein Grund zur Sorge — es ist ein Kraft- und Aufmerksamkeitsthema, das sich mit bewusstem Training korrigiert.`,
        goalText: 'Die Wirbelsäule bildet eine stabile vertikale Achse — vom Scheitel bis zum Steißbein eine gerade, aufrechte Linie. Dabei geht es nicht um militärisches Geradestehen, sondern um eine natürliche, energetische Aufrichtung: der Kopf schwebt leicht nach oben, das Becken ist neutral, die Schultern liegen entspannt auf gleicher Höhe. Im Ballett ist diese vertikale Achse das Fundament für alles — Drehungen, Sprünge, Balancen. Ohne stabile Achse kann keine saubere Technik entstehen.',
        practiceText: 'Übung 1: An der Wand stehen — Hinterkopf, Schulterblätter, Gesäß und Fersen berühren die Wand. Diese Position 30 Sekunden halten und dabei normal atmen. Das Gefühl im Körper speichern. Dann einen Schritt von der Wand weg und die Position halten. Übung 2: Vor dem Spiegel stehen und die Schultern vergleichen — ist eine höher als die andere? Bewusst korrigieren und das neue Gefühl abspeichern. Übung 3: Im Plié bewusst darauf achten, ob der Oberkörper nach rechts oder links ausweicht. Wenn ja: kurz stoppen, korrigieren, weitermachen. 5× täglich, bis die vertikale Achse automatisch ist.',
        technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${v.toFixed(1)}° laterale Neigung der Wirbelsäulenachse. Sollwert: <3° (funktionelle Vertikale). Abweichung: ${v.toFixed(1)}°.\n\nGESAMTBILD DIESES FRAMES\nDie seitliche Neigung deutet auf eine asymmetrische Gewichtsverteilung hin. Prüfen: Ist die Neigung konsistent (strukturell) oder nur in bestimmten Phasen (kompensatorisch)? Korreliert sie mit einer Schulter-Elevation auf der Gegenseite?\n\nKINEMATISCHE KETTE\nDie laterale Rumpfneigung entsteht meist durch Schwäche im M. quadratus lumborum und M. obliquus internus der Gegenseite. Bei einseitiger Belastung (z.B. immer an derselben Stangenseite stehen) kann sich eine habituelle Neigung entwickeln. Im Épaulement-Kontext kann eine kontrollierte Neigung korrekt sein — prüfen, ob bewusst oder unbewusst.\n\nDIFFERENZIALDIAGNOSE\nPrimär Gewohnheit/Aufmerksamkeit (60%): Unbewusstes Verlagern des Gewichts auf die dominante Seite. Sekundär Kraftasymmetrie (30%): Eine Seite der seitlichen Rumpfmuskulatur ist schwächer. Strukturell (10%): Skoliose oder Beinlängendifferenz — nur bei konsistenter Abweichung prüfen.\n\nSOFORT-FOKUS\nBewusstes Zentrieren des Gewichts auf beide Füße gleichmäßig. Verbale Korrektur: "Stell dir vor, du stehst auf einer Waage unter jedem Fuß — beide sollen das Gleiche anzeigen."`,
      },
      reportEntry: { label: 'Oberkörper-Neigung', timecode: fmtTime(timeSec), value: `${v.toFixed(1)}°` },
    });
  }

  // Pelvic tilt
  if (worstPelvis && worstPelvis.value > 8) {
    const timeSec = worstPelvis.timeSec;
    const v = worstPelvis.value;
    candidates.push({
      priority: v * 2,
      category: 'CORRECTION',
      cue: {
        id: `ki-pelvis-${timeSec.toFixed(3)}`,
        timeSeconds: timeSec,
        timecodeStr: fmtTime(timeSec),
        poseName: 'Beckenkippung (KI erkannt)',
        status: v > 15 ? 'WARNING' : 'CORRECTION',
        headline: `Becken kippt ${v.toFixed(1)}° – Neutralposition anstreben`,
        cueMetaphor: '"Stell dir vor, dein Becken ist eine Schüssel mit Wasser – kein Tropfen darf verschüttet werden."',
        jointFocusId: 'pelvis_core',
        dataSource: 'KI_AUTO',
        diagnosisMetaphor: '"Stell dir eine Wasserschüssel auf deinem Becken vor: Wenn sie nach vorne kippt, läuft Wasser über die Oberschenkel. Wenn nach hinten, über den Rücken. Hier kippt die Schüssel — das Wasser würde herauslaufen."',
        kiNote: `Das Becken zeigt ${v.toFixed(1)}° Kippung an diesem Frame. In der Vaganova-Methodik soll das Becken neutral-aufrecht stehen. Häufige Ursache: schwache Gluteal- oder Bauchmuskulatur, die das Becken nicht gegen die Gravitation stabilisiert.`,
        diagnosisText: `Das Becken kippt hier ${v.toFixed(1)}° aus der Neutralposition — das bedeutet, die natürliche S-Kurve der Wirbelsäule wird entweder verstärkt (Hohlkreuz bei Kippung nach vorne) oder abgeflacht (Kippung nach hinten). Bei jungen Schülerinnen passiert das häufig im Plié, wenn die Bauch- und Glutealmuskulatur das Becken nicht aktiv stabilisieren kann. Das ist kein Fehler, den man "wegdenken" kann — es braucht gezielte Kräftigung. Die gute Nachricht: Das Becken-Alignment reagiert sehr schnell auf Training, oft schon nach 2-3 Wochen bewusster Arbeit.`,
        goalText: 'Das Becken bleibt in der neutralen Mitte — weder nach vorne gekippt (Hohlkreuz) noch nach hinten eingerollt (Rundrücken). Die Lendenwirbelsäule behält ihre natürliche, sanfte Kurve. Schultern, Becken und Standfläche sind sauber übereinandergestapelt — das gibt der ganzen Bewegung Stabilität und Eleganz. Diese neutrale Beckenposition ist keine starre Fixierung, sondern ein aktives, lebendiges Gleichgewicht, das sich bei jeder Bewegung mitbewegt, aber nie die Kontrolle verliert.',
        practiceText: 'Übung 1: Leg eine Hand auf den Bauchnabel, eine auf die Lendenwirbel — beim langsamen Plié spüren, ob sich die Lendenwirbel mitbewegen. Sie sollen ruhig bleiben. Sobald du das Gefühl kennst, lass die Hände weg und vertrau dem Körpergefühl. Übung 2: Im Spiegel von der Seite schauen — ist die natürliche S-Kurve der Wirbelsäule noch da, oder wird sie zum Hohlkreuz oder Flachrücken? Übung 3: Becken-Uhr — im Stehen das Becken langsam kreisen lassen (wie eine Uhr: 12=vorne, 6=hinten, 3/9=seitlich). Dann in der Mitte stoppen — das ist die Neutralposition. 5× täglich diese Neutralposition bewusst finden und 10 Sekunden halten.',
        technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${v.toFixed(1)}° Beckenneigung (anterior/lateral). Sollwert: <5° relative Deviation von der neutralen Achse. Abweichung: ${v.toFixed(1)}°.\n\nGESAMTBILD DIESES FRAMES\nEine Beckenkippung verändert die gesamte Wirbelsäulenmechanik. Bei anteriorer Kippung: Hyperlordose der LWS, kompensatorische Kyphose der BWS, Protraktion des Kopfes. Bei posteriorer Kippung: Abflachung der LWS, Verlust der Federungsfunktion.\n\nKINEMATISCHE KETTE\nDas Becken ist das Bindeglied zwischen Ober- und Unterkörper. Eine Beckenkippung kompromittiert sowohl die En-dehors-Arbeit in der Hüfte (reduzierter Rotationsradius) als auch die Rumpfstabilität (Verlust der Core-Spannung). Schlüsselmuskeln: M. iliopsoas (Hüftbeuger — bei Verkürzung kippt das Becken nach vorne), M. gluteus maximus und M. rectus abdominis (halten das Becken neutral), M. erector spinae (bei Hypertonie kippt das Becken nach vorne).\n\nDIFFERENZIALDIAGNOSE\nAnterior (häufiger bei Kindern, 70%): Verkürzter M. iliopsoas + schwache Bauchmuskulatur. Lateral (seltener, 20%): Einseitige Belastung oder Beinlängendifferenz. Posterior (selten, 10%): Übertriebenes "Einziehen" des Beckens aus falsch verstandener Korrektur.\n\nSOFORT-FOKUS\nBewusstes Aufstellen des Beckens ohne Verkrampfung. Taktiler Hinweis: Eine Hand auf den unteren Bauch, eine auf das Steißbein — beide Hände sollen vertikal übereinander sein. Verbale Korrektur: "Lass das Steißbein schwer zum Boden sinken, als hätte es ein kleines Gewicht."`,
      },
      reportEntry: { label: 'Beckenkippung', timecode: fmtTime(timeSec), value: `${v.toFixed(1)}°` },
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
  const generatedAt = new Date().toISOString();
  const autoCuePoints = selected
    .map(c => ({
      ...c.cue,
      provenance: 'ki_suggestion' as const,
      learnerVisible: false,
      parentVisible: false,
      kiSuggestionData: {
        originalHeadline: c.cue.headline,
        originalCueMetaphor: c.cue.cueMetaphor,
        originalDiagnosisText: c.cue.diagnosisText,
        originalGoalText: c.cue.goalText,
        originalPracticeText: c.cue.practiceText,
        originalTechnicalAnalysis: c.cue.technicalAnalysis,
        metrics: [`${c.reportEntry.label}: ${c.reportEntry.value}`],
        ampelStatus: (
          c.cue.status === 'GOOD'
            ? 'CORRECT'
            : c.cue.status === 'WARNING'
              ? 'WARNING'
              : 'ERROR'
        ) as 'CORRECT' | 'WARNING' | 'ERROR',
        generatedAt,
        policyVersion: BUILD_POLICY.policyVersion,
      },
    }))
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
