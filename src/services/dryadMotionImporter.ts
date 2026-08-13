import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  type CanonicalJointSample,
  type MotionDatasetProvenance,
} from '../types/canonicalMotion';
import type {
  BalletMotionId,
  DryadMotionFrame,
  DryadMotionTrial,
  DryadMovementEvent,
} from '../types/motionRegistry';

const DRYAD_SOURCE = 'https://doi.org/10.5061/dryad.dncjsxm8v';

export interface DryadMovementSpec {
  id: Exclude<BalletMotionId, 'plie'>;
  label: string;
  eventOrder: readonly string[];
  eventLabels: Readonly<Record<string, string>>;
  laterality: 'unilateral' | 'bilateral';
}

export const DRYAD_MOVEMENT_SPECS: Readonly<Record<Exclude<BalletMotionId, 'plie'>, DryadMovementSpec>> = Object.freeze({
  tendu: Object.freeze({
    id: 'tendu', label: 'Tendu outward', laterality: 'unilateral',
    eventOrder: Object.freeze(['FRS', 'VL', 'FL', 'VR', 'FRE']),
    eventLabels: Object.freeze({
      FRS: 'Beginn der Fußbewegung', VL: 'höchste Auswärtsgeschwindigkeit', FL: 'äußerster Fußpunkt',
      VR: 'höchste Rückkehrgeschwindigkeit', FRE: 'Ende der Fußbewegung',
    }),
  }),
  passe: Object.freeze({
    id: 'passe', label: 'Passé', laterality: 'unilateral',
    // VFU precedes BR by a few milliseconds in the source movement cycle.
    eventOrder: Object.freeze(['BB', 'VBU', 'VFU', 'BR', 'FT', 'VFD', 'BF', 'VBD']),
    eventLabels: Object.freeze({
      BB: 'tiefster C7-Punkt', VBU: 'höchste Aufwärtsgeschwindigkeit C7',
      VFU: 'höchste Aufwärtsgeschwindigkeit Fuß', BR: 'Ende der C7-Aufwärtsbewegung',
      FT: 'höchster Fußpunkt', VFD: 'höchste Abwärtsgeschwindigkeit Fuß',
      BF: 'Beginn der C7-Abwärtsbewegung', VBD: 'höchste C7-Abwärtsgeschwindigkeit',
    }),
  }),
  jete: Object.freeze({
    id: 'jete', label: 'Jeté outward', laterality: 'unilateral',
    eventOrder: Object.freeze(['FLS', 'VR', 'FR', 'VL', 'FLE']),
    eventLabels: Object.freeze({
      FLS: 'Beginn der Fußbewegung', VR: 'höchste Auswärtsgeschwindigkeit', FR: 'äußerster Fußpunkt',
      VL: 'höchste Rückkehrgeschwindigkeit', FLE: 'Ende der Fußbewegung',
    }),
  }),
  changement: Object.freeze({
    id: 'changement', label: 'Changement', laterality: 'bilateral',
    eventOrder: Object.freeze(['GC', 'GP1', 'BB', 'GP2', 'GL', 'BT']),
    eventLabels: Object.freeze({
      GC: 'Beginn Bodenkraft', GP1: 'erster Kraftpeak', BB: 'tiefster C7-Punkt',
      GP2: 'zweiter Kraftpeak', GL: 'Ende Bodenkraft', BT: 'höchster C7-Punkt',
    }),
  }),
});

interface CsvRow { [key: string]: string; }

function parseSimpleCsv(csv: string): CsvRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(value => value.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
}

function finite(row: CsvRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Dryad ${key} is missing or invalid.`);
  return value;
}

function point(x: number, y: number, z: number): CanonicalJointSample {
  if (![x, y, z].every(Number.isFinite)) throw new Error('Dryad marker geometry is invalid.');
  // Dryad: x=fore/aft, y=right/left, z=up in millimetres.
  return Object.freeze({ x: y / 1000, y: z / 1000, z: -x / 1000, confidence: 1 });
}

function defaultProvenance(): MotionDatasetProvenance {
  return Object.freeze({
    datasetId: 'dryad:10.5061/dryad.dncjsxm8v:2025-01-02',
    sourceUrl: DRYAD_SOURCE,
    sourceKind: 'optical_marker',
    rightsStatus: 'product_technical_signal_allowed',
    licenseLabel: 'CC0-1.0',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  });
}

function unwrapEvents(row: CsvRow, spec: DryadMovementSpec): readonly DryadMovementEvent[] {
  let previous = Number.NEGATIVE_INFINITY;
  return Object.freeze(spec.eventOrder.map(id => {
    let timeMs = finite(row, id);
    while (timeMs <= previous) timeMs += 1000;
    previous = timeMs;
    return Object.freeze({ id, label: spec.eventLabels[id], timeUs: Math.round(timeMs * 1000) });
  }));
}

function markerExcursion(rows: readonly CsvRow[], prefix: 'RToe' | 'LToe'): number {
  const axes = ['x', 'y', 'z'] as const;
  return Math.hypot(...axes.map(axis => {
    const values = rows.map(row => finite(row, `${prefix}_${axis}`));
    return Math.max(...values) - Math.min(...values);
  }));
}

function technicalPhaseForTime(timeUs: number, events: readonly DryadMovementEvent[]): string {
  let current = events[0].id;
  for (const event of events) {
    if (event.timeUs > timeUs) break;
    current = event.id;
  }
  return current.toLocaleLowerCase('en-US');
}

/** Imports one exact Dryad trial without assigning pedagogical correctness. */
export function importDryadMotionTrial(input: {
  movementId: Exclude<BalletMotionId, 'plie'>;
  mocapCsv: string;
  movementReferenceCsv: string;
  participantId: number;
  trial: number;
  provenance?: MotionDatasetProvenance;
}): DryadMotionTrial {
  const spec = DRYAD_MOVEMENT_SPECS[input.movementId];
  const motionRows = parseSimpleCsv(input.mocapCsv).filter(row => finite(row, 'trial') === input.trial);
  const referenceRow = parseSimpleCsv(input.movementReferenceCsv).find(row => (
    finite(row, 'ID') === input.participantId && finite(row, 'Trial') === input.trial
  ));
  if (!referenceRow || motionRows.length < 3) throw new Error(`Dryad ${spec.label} trial is incomplete.`);

  const sourceEvents = unwrapEvents(referenceRow, spec);
  const startUs = sourceEvents[0].timeUs;
  const endUs = sourceEvents[sourceEvents.length - 1].timeUs;
  const workingSide = spec.laterality === 'bilateral'
    ? 'bilateral'
    : markerExcursion(motionRows, 'RToe') >= markerExcursion(motionRows, 'LToe') ? 'right' : 'left';

  const frames: DryadMotionFrame[] = motionRows.flatMap(row => {
    let sourceTimeUs = Math.round(finite(row, 'time') * 1000);
    while (sourceTimeUs < startUs) sourceTimeUs += 1_000_000;
    if (sourceTimeUs > endUs) return [];
    return [Object.freeze({
      timeUs: sourceTimeUs - startUs,
      technicalPhaseId: technicalPhaseForTime(sourceTimeUs, sourceEvents),
      joints: Object.freeze({
        neck: point(0, 0, finite(row, 'C7_z')),
        ankleL: point(finite(row, 'LAnkle_x'), finite(row, 'LAnkle_y'), finite(row, 'LAnkle_z')),
        ankleR: point(finite(row, 'RAnkle_x'), finite(row, 'RAnkle_y'), finite(row, 'RAnkle_z')),
        footL: point(finite(row, 'LToe_x'), finite(row, 'LToe_y'), finite(row, 'LToe_z')),
        footR: point(finite(row, 'RToe_x'), finite(row, 'RToe_y'), finite(row, 'RToe_z')),
      }),
    })];
  }).sort((left, right) => left.timeUs - right.timeUs);
  if (frames.length < 10) throw new Error(`Dryad ${spec.label} movement window contains too few frames.`);

  const normalizedEvents = Object.freeze(sourceEvents.map(event => Object.freeze({
    ...event,
    timeUs: event.timeUs - startUs,
  })));
  return Object.freeze({
    schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
    clipId: `dryad-${input.movementId}-p${input.participantId}-t${input.trial}`,
    exerciseId: input.movementId,
    label: `Dryad ${spec.label} · Person ${input.participantId} · Versuch ${input.trial}`,
    frameRateHz: 250,
    coordinateSystem: 'balletos_metric_right_up_forward',
    provenance: Object.freeze(input.provenance ? { ...input.provenance } : defaultProvenance()),
    frames: Object.freeze(frames),
    workingSide,
    participantId: input.participantId,
    trial: input.trial,
    events: normalizedEvents,
  });
}

