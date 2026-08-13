import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  CanonicalJointSample,
  CanonicalMotionFrame,
  CanonicalMotionPhaseId,
  DryadTenduClip,
  MotionDatasetProvenance,
  TenduPhaseEvent,
} from '../types/canonicalMotion';

const DRYAD_TENDU_SOURCE = 'https://doi.org/10.5061/dryad.dncjsxm8v';
const EVENT_IDS = ['FRS', 'VL', 'FL', 'VR', 'FRE'] as const;

const EVENT_LABELS: Readonly<Record<(typeof EVENT_IDS)[number], string>> = Object.freeze({
  FRS: 'Fuß beginnt auszustreichen',
  VL: 'höchste Auswärtsgeschwindigkeit',
  FL: 'maximale Reichweite',
  VR: 'höchste Rückkehrgeschwindigkeit',
  FRE: 'Fuß schließt die Bewegung',
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
  if (!Number.isFinite(value)) throw new Error(`Dryad Tendu contains an invalid ${key} value.`);
  return value;
}

function point(x: number, y: number, z: number): CanonicalJointSample {
  if (![x, y, z].every(Number.isFinite)) throw new Error('Dryad Tendu contains invalid marker geometry.');
  // Dryad: x=back, y=right, z=up in millimetres.
  return Object.freeze({ x: y / 1000, y: z / 1000, z: -x / 1000, confidence: 1 });
}

function unwrapEvents(row: CsvRow): readonly TenduPhaseEvent[] {
  let previous = Number.NEGATIVE_INFINITY;
  return Object.freeze(EVENT_IDS.map(id => {
    let timeMs = finite(row, id);
    while (timeMs <= previous) timeMs += 1000;
    previous = timeMs;
    return Object.freeze({ id, label: EVENT_LABELS[id], timeUs: Math.round(timeMs * 1000) });
  }));
}

function phaseForTime(timeUs: number, events: readonly TenduPhaseEvent[]): CanonicalMotionPhaseId {
  const times = events.map(event => event.timeUs);
  const boundaries = [
    (times[0] + times[1]) / 2,
    (times[1] + times[2]) / 2,
    (times[2] + times[3]) / 2,
    (times[3] + times[4]) / 2,
  ];
  if (timeUs < boundaries[0]) return 'departure';
  if (timeUs < boundaries[1]) return 'extension';
  if (timeUs < boundaries[2]) return 'full_extension';
  if (timeUs < boundaries[3]) return 'return';
  return 'closure';
}

function markerRange(rows: readonly CsvRow[], prefix: 'RToe' | 'LToe'): number {
  const values = rows.map(row => finite(row, `${prefix}_y`));
  return Math.max(...values) - Math.min(...values);
}

function defaultProvenance(): MotionDatasetProvenance {
  return Object.freeze({
    datasetId: 'dryad:10.5061/dryad.dncjsxm8v:2025-01-02',
    sourceUrl: DRYAD_TENDU_SOURCE,
    sourceKind: 'optical_marker',
    rightsStatus: 'product_technical_signal_allowed',
    licenseLabel: 'CC0-1.0',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  });
}

/**
 * Imports one exact Dryad Tendu trial. The source wraps movement events around
 * the metronome beat (-500..+500 ms), so events and samples are unwrapped into
 * one monotone FRS -> FRE movement before phase assignment.
 */
export function importDryadTenduTrial(input: {
  mocapCsv: string;
  movementReferenceCsv: string;
  participantId: number;
  trial: number;
  provenance?: MotionDatasetProvenance;
}): DryadTenduClip {
  const motionRows = parseSimpleCsv(input.mocapCsv).filter(row => finite(row, 'trial') === input.trial);
  const referenceRow = parseSimpleCsv(input.movementReferenceCsv).find(row => (
    finite(row, 'ID') === input.participantId && finite(row, 'Trial') === input.trial
  ));
  if (!referenceRow || motionRows.length < 3) throw new Error('Dryad Tendu trial is incomplete.');

  const sourceEvents = unwrapEvents(referenceRow);
  const startUs = sourceEvents[0].timeUs;
  const endUs = sourceEvents[sourceEvents.length - 1].timeUs;
  const workingSide = markerRange(motionRows, 'RToe') >= markerRange(motionRows, 'LToe') ? 'right' : 'left';

  const frames: CanonicalMotionFrame[] = motionRows.flatMap(row => {
    let sourceTimeUs = Math.round(finite(row, 'time') * 1000);
    while (sourceTimeUs < startUs) sourceTimeUs += 1_000_000;
    if (sourceTimeUs > endUs) return [];
    return [Object.freeze({
      timeUs: sourceTimeUs - startUs,
      phaseId: phaseForTime(sourceTimeUs, sourceEvents),
      joints: Object.freeze({
        neck: point(0, 0, finite(row, 'C7_z')),
        ankleL: point(finite(row, 'LAnkle_x'), finite(row, 'LAnkle_y'), finite(row, 'LAnkle_z')),
        ankleR: point(finite(row, 'RAnkle_x'), finite(row, 'RAnkle_y'), finite(row, 'RAnkle_z')),
        footL: point(finite(row, 'LToe_x'), finite(row, 'LToe_y'), finite(row, 'LToe_z')),
        footR: point(finite(row, 'RToe_x'), finite(row, 'RToe_y'), finite(row, 'RToe_z')),
      }),
    })];
  }).sort((left, right) => left.timeUs - right.timeUs);

  if (frames.length < 10) throw new Error('Dryad Tendu movement window contains too few frames.');
  const normalizedEvents = Object.freeze(sourceEvents.map(event => Object.freeze({
    ...event,
    timeUs: event.timeUs - startUs,
  })));

  return Object.freeze({
    schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
    clipId: `dryad-tendu-p${input.participantId}-t${input.trial}`,
    exerciseId: 'tendu',
    label: `Dryad Tendu · Person ${input.participantId} · Versuch ${input.trial}`,
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
