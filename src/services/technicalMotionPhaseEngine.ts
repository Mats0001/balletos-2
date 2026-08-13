import { DRYAD_TECHNICAL_PHASE_PRIORS } from '../data/dryadTechnicalPhasePriors.generated';
import type { BalletMotionId } from '../types/motionRegistry';
import type { PoseLandmark } from './realMediaPipePose';

export type TechnicalMotionId = Extract<BalletMotionId, 'passe' | 'jete' | 'changement'>;
export type PassePhaseId = 'preparation' | 'lift' | 'placement' | 'lower' | 'finish';
export type JetePhaseId = 'preparation' | 'brush' | 'release' | 'return' | 'finish';
export type ChangementPhaseId = 'preparation' | 'takeoff' | 'flight' | 'landing' | 'finish';
export type TechnicalMotionPhaseId = PassePhaseId | JetePhaseId | ChangementPhaseId;
export type TechnicalMotionDirection = 'devant' | 'a_la_seconde' | 'derriere' | 'undetermined';

export interface TechnicalMotionSample {
  timeMs: number;
  landmarks: readonly PoseLandmark[];
  torsoCenter: Readonly<{ x: number; y: number }>;
  bboxHeight: number;
  perspective: 'FRONTAL' | 'PROFILE_RIGHT' | 'PROFILE_LEFT';
}

export interface TechnicalMotionBoundary {
  id: TechnicalMotionPhaseId;
  cycleIndex: number;
  label: string;
  startIndex: number;
  endIndex: number;
  representativeIndex: number;
  confidence: number;
}

export interface TechnicalMotionPhaseDetection {
  exerciseId: TechnicalMotionId;
  boundaries: readonly TechnicalMotionBoundary[];
  workingSide: 'left' | 'right' | null;
  cycleCount: number;
  direction: TechnicalMotionDirection | null;
  directionConfidence: number;
  confidence: number;
  templateSourceId: string;
  /** Similarity of the observed temporal shape to the aggregated Dryad event timing. */
  timingPriorConfidence: number;
}

type Point = Readonly<{ x: number; y: number }>;

const PHASE_COPY: Readonly<Record<TechnicalMotionId, Readonly<{
  ids: readonly TechnicalMotionPhaseId[];
  labels: readonly string[];
}>>> = Object.freeze({
  passe: Object.freeze({
    ids: Object.freeze(['preparation', 'lift', 'placement', 'lower', 'finish'] as const),
    labels: Object.freeze(['Vorbereitung', 'Anheben', 'Passé-Position', 'Absenken', 'Schluss']),
  }),
  jete: Object.freeze({
    ids: Object.freeze(['preparation', 'brush', 'release', 'return', 'finish'] as const),
    labels: Object.freeze(['Vorbereitung', 'Abstreichen', 'Lösen', 'Rückweg', 'Schluss']),
  }),
  changement: Object.freeze({
    ids: Object.freeze(['preparation', 'takeoff', 'flight', 'landing', 'finish'] as const),
    labels: Object.freeze(['Vorbereitung', 'Absprung', 'Flugphase', 'Landung', 'Schluss']),
  }),
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function smooth(values: readonly number[], radius = 2): number[] {
  return values.map((_value, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let total = 0;
    for (let cursor = start; cursor <= end; cursor++) total += values[cursor];
    return total / (end - start + 1);
  });
}

function usable(point: PoseLandmark | undefined, minVisibility = 0.45): boolean {
  return Boolean(point)
    && Number.isFinite(point!.x) && Number.isFinite(point!.y)
    && point!.x >= -0.05 && point!.x <= 1.05
    && point!.y >= -0.05 && point!.y <= 1.05
    && Number.isFinite(point!.visibility)
    && (point!.visibility as number) >= minVisibility;
}

function footPath(samples: readonly TechnicalMotionSample[], side: 'left' | 'right'): readonly Point[] | null {
  const footIndex = side === 'left' ? 31 : 32;
  const path = samples.map(sample => {
    const foot = sample.landmarks[footIndex];
    if (!usable(foot) || !Number.isFinite(sample.bboxHeight) || sample.bboxHeight <= 0.1) return null;
    return Object.freeze({
      x: (foot.x - sample.torsoCenter.x) / sample.bboxHeight,
      y: (foot.y - sample.torsoCenter.y) / sample.bboxHeight,
    });
  });
  return path.every((point): point is Point => point !== null) ? Object.freeze(path) : null;
}

function startPoint(path: readonly Point[]): Point {
  const edgeCount = Math.max(3, Math.floor(path.length * 0.1));
  return Object.freeze({
    x: median(path.slice(0, edgeCount).map(point => point.x)),
    y: median(path.slice(0, edgeCount).map(point => point.y)),
  });
}

function expectedPeakProgress(exerciseId: TechnicalMotionId): number {
  return DRYAD_TECHNICAL_PHASE_PRIORS.find(candidate => candidate.exerciseId === exerciseId)
    ?.expectedPeakProgress ?? 0.5;
}

function templateSourceId(exerciseId: TechnicalMotionId): string {
  return DRYAD_TECHNICAL_PHASE_PRIORS.find(candidate => candidate.exerciseId === exerciseId)
    ?.datasetId ?? `dryad-${exerciseId}-technical-cohort`;
}

interface ExcursionCore {
  start: number;
  peakStart: number;
  peakEnd: number;
  peakIndex: number;
  returnEnd: number;
  shapeConfidence: number;
}

function findExcursions(signalInput: readonly number[]): readonly ExcursionCore[] {
  if (signalInput.length < 20 || signalInput.some(value => !Number.isFinite(value))) return [];
  const signal = smooth(signalInput.map(value => Math.max(0, value)));
  const range = Math.max(...signal);
  if (!Number.isFinite(range) || range < 0.035) return [];
  const enterThreshold = Math.max(0.014, range * 0.12);
  const exitThreshold = Math.max(0.008, range * 0.07);
  const minRun = 3;
  const result: ExcursionCore[] = [];
  let cursor = 0;
  while (cursor <= signal.length - minRun) {
    if (!signal.slice(cursor, cursor + minRun).every(value => value > enterThreshold)) {
      cursor++;
      continue;
    }
    const start = cursor;
    let lastAbove = cursor;
    let belowRun = 0;
    while (cursor < signal.length) {
      if (signal[cursor] > exitThreshold) {
        lastAbove = cursor;
        belowRun = 0;
      } else if (++belowRun >= minRun) {
        break;
      }
      cursor++;
    }
    let peakIndex = start;
    for (let index = start + 1; index <= lastAbove; index++) {
      if (signal[index] > signal[peakIndex]) peakIndex = index;
    }
    const peak = signal[peakIndex];
    let peakStart = peakIndex;
    while (peakStart > start && signal[peakStart - 1] >= peak * 0.82) peakStart--;
    let peakEnd = peakIndex;
    while (peakEnd < lastAbove && signal[peakEnd + 1] >= peak * 0.82) peakEnd++;
    let returnEnd = peakEnd + 1;
    while (returnEnd < signal.length - 1 && signal[returnEnd] > peak * 0.12) returnEnd++;
    const rising = signal.slice(start + 1, peakIndex + 1);
    const falling = signal.slice(peakIndex + 1, returnEnd + 1);
    const monotonic = [
      ...rising.map((value, index) => value >= signal[start + index] - peak * 0.06),
      ...falling.map((value, index) => value <= signal[peakIndex + index] + peak * 0.06),
    ];
    const monotonicRatio = monotonic.filter(Boolean).length / Math.max(1, monotonic.length);
    const amplitudeConfidence = clamp01((peak - 0.035) / 0.09);
    result.push({
      start,
      peakStart,
      peakEnd,
      peakIndex,
      returnEnd,
      shapeConfidence: clamp01(amplitudeConfidence * 0.55 + clamp01((monotonicRatio - 0.5) / 0.5) * 0.45),
    });
    cursor = Math.max(cursor + 1, returnEnd + 1);
  }
  return Object.freeze(result);
}

function buildBoundaries(
  exerciseId: TechnicalMotionId,
  cores: readonly ExcursionCore[],
  sampleCount: number,
): Readonly<{ boundaries: readonly TechnicalMotionBoundary[]; timingConfidence: number }> | null {
  const copy = PHASE_COPY[exerciseId];
  const expectedPeak = expectedPeakProgress(exerciseId);
  const boundaries: TechnicalMotionBoundary[] = [];
  const timingConfidences: number[] = [];
  cores.forEach((core, cycleIndex) => {
    const previous = cores[cycleIndex - 1];
    const next = cores[cycleIndex + 1];
    const cycleStart = previous ? Math.floor((previous.returnEnd + core.start) / 2) + 1 : 0;
    const cycleEnd = next ? Math.floor((core.returnEnd + next.start) / 2) : sampleCount - 1;
    if (
      core.start <= cycleStart
      || core.peakStart <= core.start
      || core.returnEnd <= core.peakEnd
      || cycleEnd <= core.returnEnd
    ) return;
    const progress = (core.peakIndex - cycleStart) / Math.max(1, cycleEnd - cycleStart);
    const timingConfidence = clamp01(1 - Math.abs(progress - expectedPeak) / 0.42);
    timingConfidences.push(timingConfidence);
    const confidence = clamp01(core.shapeConfidence * 0.72 + timingConfidence * 0.28);
    const ranges = [
      [cycleStart, core.start - 1, Math.floor((cycleStart + core.start - 1) / 2)],
      [core.start, core.peakStart - 1, Math.floor((core.start + core.peakStart - 1) / 2)],
      [core.peakStart, core.peakEnd, core.peakIndex],
      [core.peakEnd + 1, core.returnEnd, Math.floor((core.peakEnd + 1 + core.returnEnd) / 2)],
      [core.returnEnd + 1, cycleEnd, Math.floor((core.returnEnd + 1 + cycleEnd) / 2)],
    ] as const;
    ranges.forEach((range, index) => boundaries.push(Object.freeze({
      id: copy.ids[index], cycleIndex, label: copy.labels[index],
      startIndex: range[0], endIndex: range[1], representativeIndex: range[2], confidence,
    })));
  });
  if (boundaries.length !== cores.length * 5 || boundaries.length === 0) return null;
  return Object.freeze({
    boundaries: Object.freeze(boundaries),
    timingConfidence: median(timingConfidences),
  });
}

function dominantPerspective(samples: readonly TechnicalMotionSample[]): Readonly<{
  perspective: TechnicalMotionSample['perspective']; confidence: number;
}> {
  const counts = samples.reduce<Record<TechnicalMotionSample['perspective'], number>>((result, sample) => {
    result[sample.perspective]++;
    return result;
  }, { FRONTAL: 0, PROFILE_LEFT: 0, PROFILE_RIGHT: 0 });
  const sortedEntries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  const winner = sortedEntries[0] as [keyof typeof counts, number];
  const perspective = winner[0] as TechnicalMotionSample['perspective'];
  const count = winner[1];
  return Object.freeze({ perspective, confidence: count / Math.max(1, samples.length) });
}

function classifyDirection(
  samples: readonly TechnicalMotionSample[], path: readonly Point[], peakIndex: number,
): Readonly<{ direction: TechnicalMotionDirection; confidence: number }> {
  const origin = startPoint(path);
  const peak = path[peakIndex];
  const dx = peak.x - origin.x;
  const dy = peak.y - origin.y;
  const horizontalDominance = Math.abs(dx) / Math.max(1e-6, Math.hypot(dx, dy));
  const view = dominantPerspective(samples);
  let direction: TechnicalMotionDirection = 'undetermined';
  if (view.perspective === 'FRONTAL' && horizontalDominance >= 0.72) {
    direction = 'a_la_seconde';
  } else if (view.perspective !== 'FRONTAL' && horizontalDominance >= 0.58) {
    const facingSign = view.perspective === 'PROFILE_RIGHT' ? 1 : -1;
    direction = Math.sign(dx || facingSign) === facingSign ? 'devant' : 'derriere';
  }
  return Object.freeze({
    direction,
    confidence: direction === 'undetermined'
      ? clamp01(view.confidence * horizontalDominance * 0.35)
      : clamp01(view.confidence * horizontalDominance),
  });
}

export function detectTechnicalMotionPhases(
  exerciseId: TechnicalMotionId,
  samples: readonly TechnicalMotionSample[],
): TechnicalMotionPhaseDetection | null {
  if (samples.length < 20) return null;
  let workingSide: 'left' | 'right' | null = null;
  let direction: TechnicalMotionDirection | null = null;
  let directionConfidence = exerciseId === 'jete' ? 0 : 1;
  let signal: readonly number[] | null = null;
  let selectedPath: readonly Point[] | null = null;

  if (exerciseId === 'changement') {
    const edgeCount = Math.max(3, Math.floor(samples.length * 0.1));
    const baselineY = median(samples.slice(0, edgeCount).map(sample => sample.torsoCenter.y));
    signal = samples.map(sample => (
      Number.isFinite(sample.bboxHeight) && sample.bboxHeight > 0.1
        ? (baselineY - sample.torsoCenter.y) / sample.bboxHeight
        : Number.NaN
    ));
  } else {
    const left = footPath(samples, 'left');
    const right = footPath(samples, 'right');
    if (!left || !right) return null;
    const leftOrigin = startPoint(left);
    const rightOrigin = startPoint(right);
    const leftSignal = left.map(point => exerciseId === 'passe'
      ? Math.max(0, leftOrigin.y - point.y)
      : Math.hypot(point.x - leftOrigin.x, point.y - leftOrigin.y));
    const rightSignal = right.map(point => exerciseId === 'passe'
      ? Math.max(0, rightOrigin.y - point.y)
      : Math.hypot(point.x - rightOrigin.x, point.y - rightOrigin.y));
    const leftRange = Math.max(...leftSignal);
    const rightRange = Math.max(...rightSignal);
    workingSide = rightRange >= leftRange ? 'right' : 'left';
    signal = workingSide === 'right' ? rightSignal : leftSignal;
    selectedPath = workingSide === 'right' ? right : left;
  }

  const cores = findExcursions(signal);
  const built = buildBoundaries(exerciseId, cores, samples.length);
  if (!built) return null;
  if (exerciseId === 'jete' && selectedPath) {
    const strongest = cores.reduce((best, core) => signal![core.peakIndex] > signal![best.peakIndex] ? core : best);
    const classified = classifyDirection(samples, selectedPath, strongest.peakIndex);
    direction = classified.direction;
    directionConfidence = classified.confidence;
  }
  const confidence = median(built.boundaries.filter((_boundary, index) => index % 5 === 2).map(boundary => boundary.confidence));
  return Object.freeze({
    exerciseId,
    boundaries: built.boundaries,
    workingSide,
    cycleCount: cores.length,
    direction,
    directionConfidence,
    confidence,
    templateSourceId: templateSourceId(exerciseId),
    timingPriorConfidence: built.timingConfidence,
  });
}
