import {
  heuristicBaseState,
  heuristicEvidenceStrength,
  TEACHER_REGION_KEYS,
  type TeacherRegionKey,
} from '../types/teacherHeuristic';
import type { TeacherPhaseResult } from './teacherPhaseAnalysis';

export interface TenduTeachingFeedback {
  reviewState: 'pending_nicole';
  phaseId: TeacherPhaseResult['id'];
  region: TeacherRegionKey | null;
  evidenceStyle: 'solid' | 'dotted';
  what: string;
  why: string;
  goal: string;
  practice: string;
  metaphor: string;
  limitation: string;
}

const REGION_LABELS: Readonly<Record<TeacherRegionKey, string>> = Object.freeze({
  torsoAlignment: 'Rumpf- und Beckenorganisation',
  spine: 'Rumpfachse',
  shoulder: 'Schulterlinie',
  head: 'Kopf und Épaulement',
  armL: 'linke Armlinie',
  armR: 'rechte Armlinie',
  legL: 'linkes Bein',
  legR: 'rechtes Bein',
  pelvis: 'Beckenlinie',
  footL: 'linker Fuß',
  footR: 'rechter Fuß',
  cog: 'Gewichtsorganisation',
});

const PHASE_PRACTICE: Readonly<Record<string, string>> = Object.freeze({
  departure: 'Ausgang ruhig einfrieren: Standbein, Becken und Arbeitsfuß bewusst ordnen.',
  extension: 'Den Arbeitsfuß langsam über den Boden führen und den Weg dreimal identisch wiederholen.',
  full_extension: 'Die Endposition kurz halten, ohne die Körperachse für zusätzliche Reichweite zu verschieben.',
  return: 'Den gleichen Fußweg kontrolliert zurückverfolgen; die Zehen bleiben bis zuletzt aktiv.',
  closure: 'Den Schluss geräuschlos und präzise sammeln, dann die Ausgangslinie erneut prüfen.',
});

const PHASE_METAPHOR: Readonly<Record<string, string>> = Object.freeze({
  departure: 'Wie ein Pfeil, der vor dem Start ruhig ausgerichtet wird.',
  extension: 'Wie ein Pinsel, der eine klare Linie über den Boden zieht.',
  full_extension: 'Wie ein Lichtstrahl: lang, klar und ohne den Ursprung zu verschieben.',
  return: 'Wie ein Reißverschluss, der exakt auf derselben Spur zurückläuft.',
  closure: 'Wie zwei Magneten, die leise und genau zueinanderfinden.',
});

function severity(state: ReturnType<typeof heuristicBaseState>): number {
  return state === 'heuristic_strong_attention' ? 2 : state === 'heuristic_attention' ? 1 : 0;
}

export function buildTenduTeachingFeedback(phase: TeacherPhaseResult | null): TenduTeachingFeedback | null {
  if (!phase || !['departure', 'extension', 'full_extension', 'return', 'closure'].includes(phase.id)) return null;
  const candidates = TEACHER_REGION_KEYS.flatMap(region => {
    const state = phase.regions[region]?.state;
    const base = heuristicBaseState(state);
    return base ? [{ region, state, base }] : [];
  }).sort((a, b) => severity(b.base) - severity(a.base));
  const focus = candidates[0] ?? null;
  const base = focus?.base ?? null;
  const regionLabel = focus ? REGION_LABELS[focus.region] : 'Bewegungsorganisation';
  const evidenceStyle = focus && heuristicEvidenceStrength(focus.state) === 'stable' ? 'solid' : 'dotted';
  const what = base === 'heuristic_match'
    ? `${regionLabel} liegt in dieser Phase im aktuell geprüften Korridor.`
    : base === 'heuristic_strong_attention'
      ? `${regionLabel} weicht in dieser Phase deutlich vom aktuell geprüften Korridor ab.`
      : base === 'heuristic_attention'
        ? `${regionLabel} liegt nahe an der Korridorgrenze und ist noch nicht durchgehend stabil.`
        : 'Für diese Phase ist noch keine belastbare Regionsmessung verfügbar.';
  return Object.freeze({
    reviewState: 'pending_nicole',
    phaseId: phase.id,
    region: focus?.region ?? null,
    evidenceStyle,
    what,
    why: `Falls Nicole hier eine unveränderte Tendu-Linie erwartet, kann die sichtbare Abweichung den klaren Fußweg und den ruhigen Übergang zur nächsten Phase beeinträchtigen. Die Aufnahme zeigt nicht automatisch die Ursache.`,
    goal: `Die sichtbare Linie im Bereich „${regionLabel}“ über das gesamte Phasenfenster reproduzierbar organisieren; Nicole entscheidet, welche Linie für diese Übung und Ansicht gilt.`,
    practice: PHASE_PRACTICE[phase.id] ?? 'Phase langsam wiederholen und mit Nicole am exakten Schlüsselbild prüfen.',
    metaphor: PHASE_METAPHOR[phase.id] ?? 'Eine klare Linie entsteht aus einem ruhigen Anfang und einem bewussten Weg.',
    limitation: 'Pädagogischer KI-Entwurf · technische Phasen- und 2D-Evidenz · keine medizinische Diagnose · Nicole prüft.',
  });
}
