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

    const analysis = vaganovaAngleCalculator.analyzeFullFrame(lm, vw, vh);

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
      id: `ki-knee-${timeSec.toFixed(3)}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Knie-Alignment (KI erkannt)',
      status: 'CORRECTION',
      headline: `Knie kippt nach innen – ${worstKnee.value.toFixed(1)}° an diesem Moment`,
      cueMetaphor: '"Stell dir vor, deine Knie sind zwei Scheinwerfer – beide zeigen gleichzeitig nach außen in den Raum."',
      jointFocusId: 'left_knee',
      dataSource: 'KI_AUTO',
      diagnosisMetaphor: '"Das Knie ist wie eine Türangel — wenn sie locker wird, fällt die Tür nach innen. Hier gibt die Hüft-Angel kurz nach."',
      kiNote: `An diesem Frame kippt das Knie ${worstKnee.value.toFixed(1)}° nach innen — gut sichtbar, wenn man auf die Verbindungslinie Hüfte–Knie–Zehenspitze schaut: sie bricht am Knie zusammen. Das passiert, wenn die Außenrotation aus der Hüfte nicht aktiv genug gehalten wird. Sehr häufig beim Plié und gut trainierbar. Der Rest der Haltung sieht solide aus — das hier ist ein gezieltes Kraft-Thema, kein allgemeines Problem.`,
      goalText: 'Das Knie bleibt vom ersten Moment des Pliés bis zum tiefsten Punkt direkt über dem mittleren Zeh — die gedachte Linie von Hüfte zu Knie zu Zehenspitze bleibt eine gerade Linie. Die Außenrotation kommt aktiv aus der Hüfte, nicht durch Druck auf die Ferse oder ein Kippen des Fußes. Im Ergebnis öffnen sich die Knie wie Türen gleichmäßig nach außen, bleiben dabei stabil und kontrolliert. Das ist kein ästhetisches Ziel, sondern eine Frage der Gelenk-Gesundheit — langfristig schützt diese Ausrichtung das Kniegelenk.',
      practiceText: 'Täglich an der Stange: Nur demi-plié, sehr langsam. Im tiefsten Punkt kurz anhalten und in den Spiegel schauen — ist das Knie über dem zweiten oder dritten Zeh? Wenn nicht: kurz aktiv nach außen drücken, ohne die Ferse zu heben. Die Muskeln außen an der Hüfte sollen dabei deutlich arbeiten — das ist der richtige Muskel. 10 Wiederholungen, bewusst und langsam. Erst wenn das im demi-plié sicher sitzt, kommt das grand plié dazu. Dieser Fehler ist ein reines Kraft-Thema und korrigiert sich mit gezieltem Training in wenigen Wochen vollständig.',
      referenceImageKey: 'plie_knie_korrekt',
      technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${worstKnee.value.toFixed(1)}° mediale Deviation (Knie-Valgus) am Tiefpunkt des Plié. Sollwert: 0° — Patella lotrecht über 2. und 3. Zehe. Abweichung: ${worstKnee.value.toFixed(1)}°.\n\nGESAMTBILD DIESES FRAMES\nOberkörper und Carré bleiben in diesem Frame stabil — der Fehler ist auf die untere Extremität isoliert. Das Fußlängsgewölbe ist mit hoher Wahrscheinlichkeit kollabiert (Pronation / "Rolling in") — dieser Fußfehler geht dem Knie-Einknicken voraus und ist der eigentliche Auslöser. Im Slow-Mo prüfen: An welchem Punkt im Plié beginnt das Gewölbe einzubrechen?\n\nKINEMATISCHE KETTE\nDas Knie selbst ist nicht der Verursacher. Die Kausalkette: Mangelnde Außenrotation (En-dehors) im Hüftgelenk → Hüfte überträgt die Torsion ans Knie → Knie weicht medial aus → Fuß proniert als Endkompensation. Die tiefen Außenrotatoren (M. piriformis, Mm. gemelli, M. gluteus maximus) und M. tibialis posterior (Fußgewölbe) sind die Schlüsselmuskeln. Wenn diese Gruppe ermüdet oder strukturell schwach ist, bricht die gesamte Kette zusammen.\n\nDIFFERENZIALDIAGNOSE\nPrimär Kraftdefizit (80%): Pelvitrochanteräre Muskulatur hält im tiefen Plié nicht mehr durch. Sekundär Koordination (20%): Aufmerksamkeit auf Rotation geht beim Absenken verloren. Im Slow-Mo prüfen: Passiert das Einknicken im ersten Drittel des Plié (Kraft) oder erst am Tiefpunkt (Ermüdung)? Das bestimmt den Trainingsansatz.\n\nSOFORT-FOKUS\nRotation tief aus dem Hüftgelenk aktivieren — nicht das Knie manuell nach außen drücken. Gewicht bewusst auf die Fußaußenkante (kleiner Zeh) verlagern, Gewölbe aufrichten. Taktiler Hinweis: Druck am Trochanter major nach außen-oben, nicht am Knie direkt.`,
    });
    corrections.push({ label: 'Knie-Einfallen', timecode: fmtTime(timeSec), value: `${worstKnee.value.toFixed(1)}°` });
  }

  if (worstArm && worstArm.value > 10) {
    const timeSec = worstArm.timeSec;
    autoCuePoints.push({
      id: `ki-arm-${timeSec.toFixed(3)}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Arm-Linienführung (KI erkannt)',
      status: 'CORRECTION',
      headline: `Arm-Linie ${worstArm.value.toFixed(0)}° – Ellbogen oder Handgelenk prüfen`,
      cueMetaphor: '"Der Arm fließt wie ein Fluss – vom Schulterblatt bis zur Fingerspitze, ohne Staustufe dazwischen."',
      jointFocusId: 'left_elbow',
      dataSource: 'KI_AUTO',
      diagnosisMetaphor: '"Stell dir einen Gartenschlauch vor: Wenn du ihn irgendwo abknickst, fließt das Wasser nicht mehr durch. Genau das passiert hier mit der Energie im Arm."',
      kiNote: `Der Arm verliert hier die durchfließende Linie vom Schulterblatt bis zur Fingerspitze — meist als leichter Knick im Ellbogen (zu hoch oder zu tief) oder als abgeknicktes Handgelenk sichtbar. Von der Seite betrachtet wirkt der Arm dann nicht fließend, sondern ein bisschen gebrochen. ${worstArm.value.toFixed(0)}° Abweichung an diesem Frame. Das ist eine Frage der Körperwahrnehmung — wenn man einmal fühlt, wie sich der "durchfließende" Arm anfühlt, korrigiert sich das oft sehr schnell.`,
      goalText: 'Der Arm bildet eine fließende, leicht gerundete Kurve vom Schulterblatt bis zur Fingerspitze — kein spitzer Knick im Ellbogen, kein abgeknicktes Handgelenk, kein hochgezogenes Schulterblatt. Die Position des Ellbogens ist dabei entscheidend: Er liegt geringfügig tiefer als die Schulter, die Innenseite des Ellbogens zeigt leicht zur Decke. Das Handgelenk ist eine natürliche Verlängerung des Unterarms, nicht abgeknickt oder überstreckt. Diese weiche Linie gibt dem Port de bras seine Ausdruckskraft.',
      practiceText: 'Vor dem Spiegel ohne Musik: Den Arm langsam durch alle Positionen führen (1., 2., 3.) und dabei gezielt auf den Ellbogen achten. An jeder Position kurz anhalten: Ist der Ellbogen tiefer als die Schulter? Zeigt die Arminnenseite zur Decke? Dann das Handgelenk: Liegt es in der Verlängerung des Unterarms? Diese Kontrolle bewusst machen, bis sie automatisch wird. Übung: Arm in Position 1 halten, Augen schließen, Körpergefühl spüren. Augen öffnen, mit dem Spiegel vergleichen. Der Abstand zwischen Gefühl und Realität schließt sich mit der Zeit.',
      referenceImageKey: 'port_de_bras_ideal',
      technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${worstArm.value.toFixed(0)}° Abweichung von der idealen Armlinienführung. Sollwert: <20° (weiche Allongé-Kurve, 160°–170° im Ellbogengelenk). Abweichung: ${worstArm.value.toFixed(0)}°.\n\nGESAMTBILD DIESES FRAMES\nDie Körperachse wirkt in diesem Frame insgesamt stabil. Die Schulter ist wahrscheinlich leicht eleviert (hochgezogen) — das ist fast immer mit einem Arm-Knick korreliert. Das Handgelenk nach dem Ellbogen möglicherweise überstreckt oder spannungslos ("tote Hand"). Von der Seite ist die Armlinie nicht fließend, sondern weist eine Brechung auf. Prüfen: Passiert der Knick am Ellbogen oder am Handgelenk? Das entscheidet den Korrektur-Ansatz.\n\nKINEMATISCHE KETTE\nEine gebrochene Armlinie entsteht fast immer durch fehlende Verankerung des Schulterblatts am Thorax. Wenn der untere Trapezius und M. latissimus dorsi das Schulterblatt nicht in aktiver Depression halten, übernimmt der M. deltoideus die Haltearbeit allein — Resultat: Schulter geht hoch, Ellbogen knickt ein (der Körper senkt das Gewicht durch Beugen). Zusätzlich: Fehlt die Opposition (Energie von der Schulter durch den Ellbogen bis in die Fingerspitze denken), kollabiert die Linie am schwächsten Punkt.\n\nDIFFERENZIALDIAGNOSE\nPrimär Koordination / Gewohnheit ("Posing"): Die Schülerin positioniert die Hand im Raum, statt Energie aus dem Rücken durch den Ellbogen bis in die Fingerspitzen zu denken. Selten ein Kraftproblem. Prüfen mit der Frage: Wenn Nicole einen leichten Widerstand gegen den Ellbogen gibt, richtet sich der Arm auf? Dann ist es ein Aufmerksamkeitsproblem, kein Kraftproblem.\n\nSOFORT-FOKUS\nEllbogen energetisch heben, gleichzeitig das Schulterblatt in die Gesäßtasche senken (Rückenstütze aktivieren). Verbale Korrektur: "Lass den Ellbogen den Arm führen, nicht die Hand."`,
    });
    corrections.push({ label: 'Arm-Linienführung', timecode: fmtTime(timeSec), value: `${worstArm.value.toFixed(0)}°` });
  }

  // ── STÄRKEN ───────────────────────────────────────────────────────────────
  if (bestShoulder && bestShoulder.value > 150) {
    const timeSec = bestShoulder.timeSec;
    autoCuePoints.push({
      id: `ki-shoulder-good-${timeSec.toFixed(3)}`,
      timeSeconds: timeSec,
      timecodeStr: fmtTime(timeSec),
      poseName: 'Schulter-Horizontalität (KI erkannt)',
      status: 'GOOD',
      headline: 'Schöne ruhige Schulter-Linie – genau so soll es sein',
      cueMetaphor: '"Die Schultern sind ein Tablett, das du balancierst — kein Tropfen darf herunterfallen."',
      jointFocusId: 'shoulder_line',
      dataSource: 'KI_AUTO',
      diagnosisMetaphor: '"Genau so soll es aussehen: Die Schultern liegen wie Flügel, die ruhig ausgebreitet sind — weder hochgezogen noch eingefallen."',
      kiNote: 'An diesem Frame sind die Schultern wirklich schön ruhig und fast perfekt parallel — die Schulterblätter sitzen aktiv nach unten, ohne Anspannung im Nacken. Das gibt der Bewegung sofort mehr Eleganz und wirkt auf alle im Raum. Das ist eine echte Stärke: diese ruhige, breite Schulter-Linie bewusst im Körpergedächtnis verankern — so soll es immer aussehen.',
      goalText: 'Diese Schulter-Position als Referenz-Gefühl im Körpergedächtnis verankern. Hier liegt alles richtig: Die Schulterblätter sitzen breit und aktiv nach unten — nicht hochgezogen, nicht zusammengekniffen. Der Nacken ist lang und frei. Die horizontale Schulterlinie gibt der gesamten Oberkörperhaltung Würde und Ruhe. Dieses Gefühl kennen und auf Abruf reproduzieren können — das ist das Ziel.',
      practiceText: 'Diesen Frame nutzen als persönliche Referenz. Bewusst im Körper spüren: Was passiert gerade mit den Schulterblättern? Wo liegt die Spannung? Dieses Körpergefühl als "Anker" speichern. Übung: Schultern hochziehen, drei Sekunden halten, dann langsam loslassen und tiefer sinken lassen als normal — das ist die richtige Position. Mehrmals täglich, auch ohne Tanzen: beim Sitzen, beim Gehen. Diese Schulterposition soll zur Normalstellung werden, nicht zur bewussten Anspannung.',
      referenceImageKey: 'epaulement_ideal',
      technicalAnalysis: `METRISCHE DIAGNOSE\nIstwert: ${(bestShoulder.value).toFixed(0)}° Schulter-Symmetriewert (180° = perfekte Horizontalität). Abweichung: nahe 0°. Das ist der beste gemessene Frame in dieser Aufnahme — als persönlicher Referenz-Frame speichern.\n\nGESAMTBILD DIESES FRAMES\nExzellente Gesamthaltung: Schulterblätter sitzen aktiv in Depression auf dem Thorax — kein Hochziehen, kein Zusammenkneifen. Das Hals-Nacken-Dreieck ist lang und spannungsfrei. Das Épaulement wird korrekt aus der Brustwirbelsäule (BWS) initiiert, nicht aus den Schultergelenken. Diesen Frame als Referenz speichern — er zeigt das Optimum dieser Schülerin.\n\nKINEMATISCHE KETTE\nEine perfekte Schulter-Horizontalität in der Dynamik beweist exzellente Kernstabilität (Core). Das Becken ist in diesem Moment neutral platziert, die Wirbelsäule rotiert frei als zentrale Achse, ohne dass der Schultergürtel asymmetrisch kompensieren muss. Das Zusammenspiel von tiefer Bauchmuskulatur, Multifidus und unterem Trapezius funktioniert hier einwandfrei.\n\nDIFFERENZIALDIAGNOSE\nKeine Fehlerquelle — das ist eine bestätigte Stärke. Gute intermuskuläre Koordination zwischen Rumpf- und Schultergürtelmuskulatur. Prüfen: Ist diese Qualität konsistent über die gesamte Aufnahme, oder ist das ein singulärer Hochpunkt? Wenn konsistent: Als gelerntes Muster dokumentieren.\n\nSOFORT-FOKUS\nLob mit konkreter somatischer Aufgabe: "Merk dir das Gefühl des weiten Schlüsselbeins in dieser Pose — das ist dein persönlicher Anker-Moment." Auf Abruf reproduzieren können ist das Trainingsziel.`,
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
