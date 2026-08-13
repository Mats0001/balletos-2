import type { BalletMotionId } from '../types/motionRegistry';
import {
  TEACHER_FEEDBACK_LIBRARY_VERSION,
  type FeedbackAgeBand,
  type FeedbackDirection,
  type TeacherFeedbackDraft,
} from '../types/teacherFeedbackLibrary';
import type { TeacherEvidenceStrength, TeacherHeuristicBaseState, TeacherRegionKey } from '../types/teacherHeuristic';

interface PhaseScaffold {
  label: string;
  visibleIntent: string;
  practice: string;
  image: string;
}

const PHASES: Readonly<Record<BalletMotionId, Readonly<Record<string, PhaseScaffold>>>> = Object.freeze({
  plie: Object.freeze({
    setup: { label: 'Ausgang', visibleIntent: 'die Ausgangsorganisation ruhig und reproduzierbar vorzubereiten', practice: 'Ausgang kurz einfrieren, sichtbare Linien ordnen und erst dann beginnen.', image: 'ein ruhiges Fundament vor der Bewegung' },
    descent: { label: 'Abwärtsbewegung', visibleIntent: 'die Abwärtsbewegung gleichmäßig zu führen', practice: 'Langsam abwärts zählen und den sichtbaren Weg zweimal gleich wiederholen.', image: 'ein Aufzug, der ruhig nach unten fährt' },
    bottom: { label: 'Tiefster Punkt', visibleIntent: 'den tiefsten Punkt ohne sichtbares Ausweichen zu organisieren', practice: 'Den tiefsten Punkt kurz halten und gemeinsam das Schlüsselbild prüfen.', image: 'eine Feder im tiefsten, aber noch getragenen Moment' },
    ascent: { label: 'Aufwärtsbewegung', visibleIntent: 'die Aufwärtsbewegung kontrolliert zurückzuführen', practice: 'Auf demselben sichtbaren Weg aufsteigen und das Tempo konstant halten.', image: 'ein Aufzug auf derselben Schiene nach oben' },
    finish: { label: 'Abschluss', visibleIntent: 'den Abschluss präzise in der Ausgangslinie zu sammeln', practice: 'Geräuschlos schließen, kurz stehen und die Ausgangslinie vergleichen.', image: 'ein Satzzeichen am klaren Ende der Bewegung' },
  }),
  tendu: Object.freeze({
    departure: { label: 'Ausgang', visibleIntent: 'Standbein, Becken und Arbeitsfuß vor dem Abstreichen zu ordnen', practice: 'Ausgang ruhig einfrieren und den ersten Bewegungsimpuls erst nach der Kontrolle setzen.', image: 'ein Pfeil, der vor dem Start ruhig ausgerichtet wird' },
    extension: { label: 'Abstreichen', visibleIntent: 'den Arbeitsfuß auf einer klaren Bahn nach außen zu führen', practice: 'Den Arbeitsfuß langsam über den Boden führen und den Weg dreimal identisch wiederholen.', image: 'ein Pinsel, der eine klare Linie über den Boden zieht' },
    full_extension: { label: 'Volle Streckung', visibleIntent: 'die Endposition lang zu zeigen, ohne den Ursprung sichtbar zu verschieben', practice: 'Die Endposition kurz halten und die sichtbare Körperorganisation mit Nicole prüfen.', image: 'ein Lichtstrahl, lang und klar vom selben Ursprung' },
    return: { label: 'Rückweg', visibleIntent: 'auf derselben sichtbaren Fußbahn kontrolliert zurückzukehren', practice: 'Den gleichen Fußweg zurückverfolgen und den Kontakt bis zuletzt bewusst halten.', image: 'ein Reißverschluss auf exakt derselben Spur' },
    closure: { label: 'Schluss', visibleIntent: 'den Fuß ruhig und präzise in die Ausgangsposition zu sammeln', practice: 'Den Schluss geräuschlos sammeln und die Ausgangslinie erneut einfrieren.', image: 'zwei Magneten, die leise und genau zueinanderfinden' },
  }),
  passe: Object.freeze({
    preparation: { label: 'Vorbereitung', visibleIntent: 'Standseite und Rumpf vor dem Anheben zu organisieren', practice: 'Vorbereitung halten, Standseite prüfen und erst dann den Fuß lösen.', image: 'ein ruhiger Mast vor dem Hissen der Fahne' },
    lift: { label: 'Anheben', visibleIntent: 'den Arbeitsfuß kontrolliert am Standbein entlangzuführen', practice: 'Langsam anheben und den sichtbaren Fußweg in Teilstrecken wiederholen.', image: 'ein Aufzug, der nah an seiner Führungsschiene bleibt' },
    placement: { label: 'Passé-Position', visibleIntent: 'die sichtbare Position stabil und klar zu halten', practice: 'Position kurz halten und Becken, Standseite und Fußpunkt einzeln prüfen.', image: 'ein ruhiger Fixpunkt in der Mitte eines Kompasses' },
    lower: { label: 'Absenken', visibleIntent: 'den Fuß kontrolliert auf derselben Bahn abzusenken', practice: 'Absenken verlangsamen und denselben Weg wie beim Anheben suchen.', image: 'ein Fahrstuhl, der in derselben Spur zurückkehrt' },
    finish: { label: 'Schluss', visibleIntent: 'den Abschluss kontrolliert und ohne Nachkorrektur zu sammeln', practice: 'Schließen, zwei Sekunden stehen und sichtbare Restbewegung reduzieren.', image: 'eine Tür, die leise und genau ins Schloss fällt' },
  }),
  jete: Object.freeze({
    preparation: { label: 'Vorbereitung', visibleIntent: 'Körperachse und Arbeitsfuß für den Impuls vorzubereiten', practice: 'Vorbereitung einfrieren und Richtung sowie Standseite markieren.', image: 'ein gespannter, aber ruhiger Bogen' },
    brush: { label: 'Abstreichen', visibleIntent: 'den Fußweg klar zu beginnen und den Impuls sichtbar zu führen', practice: 'Abstreichen isoliert und mit kleinerem Bewegungsumfang wiederholen.', image: 'ein schneller Pinselstrich auf einer klaren Bahn' },
    release: { label: 'Lösen', visibleIntent: 'den Übergang vom Boden in die freie Bewegung kontrolliert zu zeigen', practice: 'Übergang verlangsamen und den Moment des Lösens markieren.', image: 'ein Papierflieger im Moment des Abhebens' },
    return: { label: 'Rückweg', visibleIntent: 'den Arbeitsfuß kontrolliert zur Ausgangsbahn zurückzuführen', practice: 'Rückweg einzeln üben und Landepunkt sichtbar festlegen.', image: 'ein Ball, der sicher zur Hand zurückfindet' },
    finish: { label: 'Schluss', visibleIntent: 'den Abschluss ruhig und präzise zu sammeln', practice: 'Nach dem Schluss zwei Zählzeiten ohne Nachbewegung stehen.', image: 'ein klarer Punkt am Ende einer schnellen Linie' },
  }),
  changement: Object.freeze({
    preparation: { label: 'Vorbereitung', visibleIntent: 'die Vorbereitung symmetrisch und kontrolliert aufzubauen', practice: 'Vorbereitung ohne Sprung wiederholen und beide Seiten sichtbar vergleichen.', image: 'zwei gleich gespannte Federn' },
    takeoff: { label: 'Absprung', visibleIntent: 'den Absprung zeitlich klar und aus einer ruhigen Basis zu organisieren', practice: 'Kleine Absprünge mit ruhigem Oberkörper und identischem Timing üben.', image: 'eine Feder, die gerade nach oben schnellt' },
    flight: { label: 'Flugphase', visibleIntent: 'den Wechsel in der Luft klar und kompakt zu zeigen', practice: 'Beinwechsel zunächst klein markieren und die Flugphase per Standbild prüfen.', image: 'eine Schere, die sich in der Luft klar neu ordnet' },
    landing: { label: 'Landung', visibleIntent: 'die Landung sichtbar zu dämpfen und kontrolliert auszurichten', practice: 'Leise Landungen aus kleiner Höhe üben und die Stabilität danach halten.', image: 'eine Katze, die leise und weich landet' },
    finish: { label: 'Abschluss', visibleIntent: 'nach der Landung ruhig in der neuen Position zu enden', practice: 'Nach der Landung zwei Zählzeiten einfrieren und sichtbare Nachkorrekturen reduzieren.', image: 'ein Foto, das nach der Bewegung scharf stehen bleibt' },
  }),
});

const REGIONS: Readonly<Record<TeacherRegionKey, Readonly<{ label: string; visibleGoal: string; possibleEffect: string }>>> = Object.freeze({
  torsoAlignment: { label: 'Rumpf- und Beckenorganisation', visibleGoal: 'Rumpf und Becken über das Phasenfenster ruhig organisieren', possibleEffect: 'der Bewegungsweg weniger klar lesbar werden' },
  spine: { label: 'Rumpfachse', visibleGoal: 'die sichtbare Rumpfachse reproduzierbar führen', possibleEffect: 'die Richtung der Bewegung optisch unruhiger erscheinen' },
  shoulder: { label: 'Schulterlinie', visibleGoal: 'die Schulterlinie zur gewählten Ansicht passend ruhig halten', possibleEffect: 'die Arm- und Oberkörperlinie ihre Klarheit verlieren' },
  pelvis: { label: 'Beckenlinie', visibleGoal: 'die sichtbare Beckenlinie phasengerecht kontrollieren', possibleEffect: 'die Beinbewegung optisch aus der Körpermitte ausweichen' },
  head: { label: 'Kopf und Épaulement', visibleGoal: 'Kopf und Blickrichtung bewusst zur Linie koordinieren', possibleEffect: 'die Bewegungsrichtung weniger deutlich lesbar sein' },
  armL: { label: 'linke Armlinie', visibleGoal: 'die linke Armlinie ruhig und phasengerecht weiterführen', possibleEffect: 'die Gesamtlinie links unruhiger wirken' },
  armR: { label: 'rechte Armlinie', visibleGoal: 'die rechte Armlinie ruhig und phasengerecht weiterführen', possibleEffect: 'die Gesamtlinie rechts unruhiger wirken' },
  legL: { label: 'linkes Bein', visibleGoal: 'das linke Bein auf einer wiederholbaren sichtbaren Bahn führen', possibleEffect: 'Richtung oder Abschluss weniger präzise erscheinen' },
  legR: { label: 'rechtes Bein', visibleGoal: 'das rechte Bein auf einer wiederholbaren sichtbaren Bahn führen', possibleEffect: 'Richtung oder Abschluss weniger präzise erscheinen' },
  footL: { label: 'linker Fuß', visibleGoal: 'den linken Fußweg und den Endpunkt klar wiederholen', possibleEffect: 'Fußbahn und Schluss weniger eindeutig lesbar sein' },
  footR: { label: 'rechter Fuß', visibleGoal: 'den rechten Fußweg und den Endpunkt klar wiederholen', possibleEffect: 'Fußbahn und Schluss weniger eindeutig lesbar sein' },
  cog: { label: 'Gewichtsorganisation', visibleGoal: 'die projizierte Gewichtsorganisation ruhig über der sichtbaren Standfläche halten', possibleEffect: 'Übergänge und Standseite optisch weniger stabil wirken' },
});

function ageBandFromLabel(label: string): FeedbackAgeBand {
  const normalized = label.toLocaleLowerCase('de-DE');
  if (normalized.includes('mini')) return 'minis';
  if (normalized.includes('kid')) return 'kids';
  if (normalized.includes('teen')) return 'teens';
  return 'pro';
}

function metaphorForAge(image: string, ageBand: FeedbackAgeBand): string {
  if (ageBand === 'minis') return `Stell dir vor: ${image}.`;
  if (ageBand === 'kids') return `Bewegungsbild: ${image}. Kannst du es zweimal gleich zeigen?`;
  if (ageBand === 'teens') return `Nutze das Bild „${image}“, um Weg und Abschluss bewusst zu koordinieren.`;
  return `Mentales Bewegungsbild: ${image}; nur verwenden, wenn Nicole es für diese Stufe freigibt.`;
}

function observation(label: string, state: TeacherHeuristicBaseState): string {
  if (state === 'heuristic_match') return `${label} bleibt in dieser Phase im aktuell geprüften sichtbaren Korridor.`;
  if (state === 'heuristic_strong_attention') return `${label} weicht in dieser Phase deutlich vom aktuell geprüften sichtbaren Korridor ab.`;
  return `${label} liegt nahe an der sichtbaren Korridorgrenze und ist noch nicht durchgehend stabil.`;
}

function directionLabel(direction: FeedbackDirection): string {
  if (direction === 'devant') return 'devant';
  if (direction === 'a_la_seconde') return 'à la seconde';
  if (direction === 'derriere') return 'derrière';
  if (direction === 'left') return 'nach links';
  if (direction === 'right') return 'nach rechts';
  if (direction === 'bilateral') return 'beidseitig';
  return '';
}

export function feedbackAgeBandFromLevel(levelLabel: string): FeedbackAgeBand {
  return ageBandFromLabel(levelLabel);
}

export function feedbackPhaseIds(exerciseId: BalletMotionId): readonly string[] {
  return Object.freeze(Object.keys(PHASES[exerciseId]));
}

export function buildTeacherFeedbackDraft(input: Readonly<{
  exerciseId: BalletMotionId;
  phaseId: string;
  region: TeacherRegionKey;
  ageBand: FeedbackAgeBand;
  trafficClass: TeacherHeuristicBaseState;
  evidenceStrength: TeacherEvidenceStrength;
  direction?: FeedbackDirection;
}>): TeacherFeedbackDraft | null {
  const phase = PHASES[input.exerciseId]?.[input.phaseId];
  const region = REGIONS[input.region];
  if (!phase || !region) return null;
  const direction = input.direction ?? 'not_applicable';
  const directionContext = directionLabel(direction);
  const contentId = [TEACHER_FEEDBACK_LIBRARY_VERSION, input.exerciseId, input.phaseId, direction, input.region, input.ageBand, input.trafficClass].join(':');
  return Object.freeze({
    schemaVersion: 1,
    contentId,
    libraryVersion: TEACHER_FEEDBACK_LIBRARY_VERSION,
    exerciseId: input.exerciseId,
    phaseId: input.phaseId,
    phaseLabel: phase.label,
    region: input.region,
    ageBand: input.ageBand,
    direction,
    trafficClass: input.trafficClass,
    evidenceStrength: input.evidenceStrength,
    evidenceStyle: input.evidenceStrength === 'stable' ? 'solid' : 'dotted',
    reviewState: 'pending_nicole',
    learnerVisible: false,
    parentVisible: false,
    claimBoundary: 'visible_observation_and_possible_pedagogical_effect',
    sections: Object.freeze({
      what: `${observation(region.label, input.trafficClass)}${directionContext ? ` Beobachtungsrichtung: ${directionContext}.` : ''}`,
      whyPossible: `Wenn Nicole in „${phase.label}“ ${phase.visibleIntent} erwartet, kann die sichtbare Abweichung dazu führen, dass ${region.possibleEffect}. Die Aufnahme zeigt nicht automatisch die Ursache.`,
      goal: `${region.visibleGoal} und dadurch ${phase.visibleIntent}. Nicole legt den akzeptierten Korridor fest.`,
      practice: `${phase.practice} Fokus für diese Wiederholung: ${region.label}.`,
      metaphor: metaphorForAge(phase.image, input.ageBand),
    }),
    limitations: Object.freeze([
      'Pädagogischer KI-Entwurf · Nicole prüft und entscheidet.',
      'Sichtbare 2D-Beobachtung und mögliche pädagogische Wirkung · keine medizinische Ursache oder Diagnose.',
      'Keine Freigabe für Lernende oder Eltern vor einer Nicole-Revision.',
    ]),
  });
}
