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
  /** Anteil real beobachteter (nicht interpolierter) Samples in dieser Phase. */
  evidenceCoverage: number;
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
type OptionalPoint = Point | null;

interface IndexSpan {
  start: number;
  end: number;
}

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

function rawFootPath(samples: readonly TechnicalMotionSample[], side: 'left' | 'right'): readonly OptionalPoint[] {
  const footIndex = side === 'left' ? 31 : 32;
  return Object.freeze(samples.map(sample => {
    const foot = sample.landmarks[footIndex];
    if (!usable(foot) || !Number.isFinite(sample.bboxHeight) || sample.bboxHeight <= 0.1) return null;
    return Object.freeze({
      x: (foot.x - sample.torsoCenter.x) / sample.bboxHeight,
      y: (foot.y - sample.torsoCenter.y) / sample.bboxHeight,
    });
  }));
}

function startPoint(path: readonly Point[]): Point {
  const edgeCount = Math.max(3, Math.floor(path.length * 0.12));
  return Object.freeze({
    x: median(path.slice(0, edgeCount).map(point => point.x)),
    y: median(path.slice(0, edgeCount).map(point => point.y)),
  });
}

function nominalFrameStepMs(samples: readonly TechnicalMotionSample[]): number | null {
  const deltas = samples.slice(1).map((sample, index) => sample.timeMs - samples[index].timeMs);
  if (deltas.some(delta => !Number.isFinite(delta) || delta <= 0)) return null;
  const compact = deltas.filter(delta => delta <= 250);
  const result = median(compact.length > 0 ? compact : deltas);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function temporalSpans(samples: readonly TechnicalMotionSample[], nominalStepMs: number): readonly IndexSpan[] {
  const result: IndexSpan[] = [];
  let start = 0;
  const discontinuityMs = Math.max(100, nominalStepMs * 3.5);
  for (let index = 1; index < samples.length; index++) {
    if (samples[index].timeMs - samples[index - 1].timeMs > discontinuityMs) {
      if (index - start >= 20) result.push(Object.freeze({ start, end: index - 1 }));
      start = index;
    }
  }
  if (samples.length - start >= 20) result.push(Object.freeze({ start, end: samples.length - 1 }));
  return Object.freeze(result);
}

function interpolateShortPointGaps(
  input: readonly OptionalPoint[],
  maxGap = 2,
): Readonly<{ path: readonly OptionalPoint[]; observed: readonly boolean[] }> {
  const result = [...input];
  const observed = input.map(point => point !== null);
  let cursor = 0;
  while (cursor < result.length) {
    if (result[cursor] !== null) {
      cursor++;
      continue;
    }
    const gapStart = cursor;
    while (cursor < result.length && result[cursor] === null) cursor++;
    const gapEnd = cursor - 1;
    const gapLength = gapEnd - gapStart + 1;
    const before = result[gapStart - 1];
    const after = result[cursor];
    if (gapLength > maxGap || !before || !after) continue;
    for (let offset = 1; offset <= gapLength; offset++) {
      const progress = offset / (gapLength + 1);
      result[gapStart + offset - 1] = Object.freeze({
        x: before.x + (after.x - before.x) * progress,
        y: before.y + (after.y - before.y) * progress,
      });
    }
  }
  return Object.freeze({ path: Object.freeze(result), observed: Object.freeze(observed) });
}

function finitePointSpans(path: readonly OptionalPoint[], parent: IndexSpan): readonly IndexSpan[] {
  const result: IndexSpan[] = [];
  let cursor = parent.start;
  while (cursor <= parent.end) {
    while (cursor <= parent.end && path[cursor] === null) cursor++;
    const start = cursor;
    while (cursor <= parent.end && path[cursor] !== null) cursor++;
    if (cursor - start >= 20) result.push(Object.freeze({ start, end: cursor - 1 }));
  }
  return Object.freeze(result);
}

function finiteNumberSpans(values: readonly number[], parent: IndexSpan): readonly IndexSpan[] {
  const result: IndexSpan[] = [];
  let cursor = parent.start;
  while (cursor <= parent.end) {
    while (cursor <= parent.end && !Number.isFinite(values[cursor])) cursor++;
    const start = cursor;
    while (cursor <= parent.end && Number.isFinite(values[cursor])) cursor++;
    if (cursor - start >= 20) result.push(Object.freeze({ start, end: cursor - 1 }));
  }
  return Object.freeze(result);
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
  amplitude: number;
  segmentStart: number;
  segmentEnd: number;
}

function findExcursions(signalInput: readonly number[], offset = 0): readonly ExcursionCore[] {
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
      start: start + offset,
      peakStart: peakStart + offset,
      peakEnd: peakEnd + offset,
      peakIndex: peakIndex + offset,
      returnEnd: returnEnd + offset,
      shapeConfidence: clamp01(amplitudeConfidence * 0.55 + clamp01((monotonicRatio - 0.5) / 0.5) * 0.45),
      amplitude: peak,
      segmentStart: offset,
      segmentEnd: offset + signal.length - 1,
    });
    cursor = Math.max(cursor + 1, returnEnd + 1);
  }
  return Object.freeze(result);
}

function buildBoundaries(
  exerciseId: TechnicalMotionId,
  cores: readonly ExcursionCore[],
  sampleCount: number,
  observed: readonly boolean[],
): Readonly<{ boundaries: readonly TechnicalMotionBoundary[]; timingConfidence: number }> | null {
  const copy = PHASE_COPY[exerciseId];
  const expectedPeak = expectedPeakProgress(exerciseId);
  const boundaries: TechnicalMotionBoundary[] = [];
  const timingConfidences: number[] = [];
  cores.forEach((core, cycleIndex) => {
    const previous = cores[cycleIndex - 1];
    const next = cores[cycleIndex + 1];
    const cycleStart = previous && previous.segmentStart === core.segmentStart
      ? Math.floor((previous.returnEnd + core.start) / 2) + 1
      : core.segmentStart;
    const cycleEnd = next && next.segmentStart === core.segmentStart
      ? Math.floor((core.returnEnd + next.start) / 2)
      : Math.min(sampleCount - 1, core.segmentEnd);
    if (
      core.start <= cycleStart
      || core.peakStart <= core.start
      || core.returnEnd <= core.peakEnd
      || cycleEnd <= core.returnEnd
    ) return;
    const progress = (core.peakIndex - cycleStart) / Math.max(1, cycleEnd - cycleStart);
    const timingConfidence = clamp01(1 - Math.abs(progress - expectedPeak) / 0.42);
    timingConfidences.push(timingConfidence);
    const baseConfidence = clamp01(core.shapeConfidence * 0.72 + timingConfidence * 0.28);
    const ranges = [
      [cycleStart, core.start - 1, Math.floor((cycleStart + core.start - 1) / 2)],
      [core.start, core.peakStart - 1, Math.floor((core.start + core.peakStart - 1) / 2)],
      [core.peakStart, core.peakEnd, core.peakIndex],
      [core.peakEnd + 1, core.returnEnd, Math.floor((core.peakEnd + 1 + core.returnEnd) / 2)],
      [core.returnEnd + 1, cycleEnd, Math.floor((core.returnEnd + 1 + cycleEnd) / 2)],
    ] as const;
    ranges.forEach((range, index) => {
      const phaseObserved = observed.slice(range[0], range[1] + 1);
      const evidenceCoverage = phaseObserved.filter(Boolean).length / Math.max(1, phaseObserved.length);
      boundaries.push(Object.freeze({
        id: copy.ids[index], cycleIndex, label: copy.labels[index],
        startIndex: range[0], endIndex: range[1], representativeIndex: range[2],
        confidence: clamp01(baseConfidence * (0.55 + evidenceCoverage * 0.45)),
        evidenceCoverage,
      }));
    });
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
  samples: readonly TechnicalMotionSample[], path: readonly OptionalPoint[], core: ExcursionCore,
): Readonly<{ direction: TechnicalMotionDirection; confidence: number }> {
  const preparation = path
    .slice(Math.max(core.segmentStart, core.start - 8), core.start + 1)
    .filter((point): point is Point => point !== null);
  const peak = path[core.peakIndex];
  if (preparation.length < 3 || !peak) return Object.freeze({ direction: 'undetermined', confidence: 0 });
  const origin = startPoint(preparation);
  const dx = peak.x - origin.x;
  const dy = peak.y - origin.y;
  const horizontalDominance = Math.abs(dx) / Math.max(1e-6, Math.hypot(dx, dy));
  const view = dominantPerspective(samples.slice(core.start, core.returnEnd + 1));
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

interface SideMotionAnalysis {
  path: readonly OptionalPoint[];
  observed: readonly boolean[];
  cores: readonly ExcursionCore[];
  score: number;
}

function analyzeFootSide(
  exerciseId: Extract<TechnicalMotionId, 'passe' | 'jete'>,
  samples: readonly TechnicalMotionSample[],
  spans: readonly IndexSpan[],
  side: 'left' | 'right',
): SideMotionAnalysis {
  const interpolated = interpolateShortPointGaps(rawFootPath(samples, side));
  const cores: ExcursionCore[] = [];
  spans.forEach(span => {
    finitePointSpans(interpolated.path, span).forEach(finiteSpan => {
      const points = interpolated.path.slice(finiteSpan.start, finiteSpan.end + 1) as readonly Point[];
      const origin = startPoint(points);
      const localSignal = points.map(point => exerciseId === 'passe'
        ? Math.max(0, origin.y - point.y)
        : Math.hypot(point.x - origin.x, point.y - origin.y));
      cores.push(...findExcursions(localSignal, finiteSpan.start));
    });
  });
  const score = cores.reduce((total, core) => total + core.amplitude * (0.5 + core.shapeConfidence * 0.5), 0);
  return Object.freeze({
    path: interpolated.path,
    observed: interpolated.observed,
    cores: Object.freeze(cores.sort((left, right) => left.start - right.start)),
    score,
  });
}

function analyzeChangement(
  samples: readonly TechnicalMotionSample[],
  spans: readonly IndexSpan[],
): Readonly<{ observed: readonly boolean[]; cores: readonly ExcursionCore[] }> {
  const raw = samples.map(sample => (
    Number.isFinite(sample.torsoCenter.y) && Number.isFinite(sample.bboxHeight) && sample.bboxHeight > 0.1
      ? sample.torsoCenter.y
      : Number.NaN
  ));
  const observed = raw.map(Number.isFinite);
  const cores: ExcursionCore[] = [];
  spans.forEach(span => {
    finiteNumberSpans(raw, span).forEach(finiteSpan => {
      const values = raw.slice(finiteSpan.start, finiteSpan.end + 1);
      const edgeCount = Math.max(3, Math.floor(values.length * 0.12));
      const baselineY = median(values.slice(0, edgeCount));
      const localSignal = values.map((value, index) => (
        (baselineY - value) / samples[finiteSpan.start + index].bboxHeight
      ));
      cores.push(...findExcursions(localSignal, finiteSpan.start));
    });
  });
  return Object.freeze({ observed: Object.freeze(observed), cores: Object.freeze(cores) });
}

function consensusDirection(
  samples: readonly TechnicalMotionSample[],
  path: readonly OptionalPoint[],
  cores: readonly ExcursionCore[],
): Readonly<{ direction: TechnicalMotionDirection; confidence: number }> {
  const classified = cores.map(core => ({ ...classifyDirection(samples, path, core), weight: core.shapeConfidence }));
  const weighted = classified.reduce<Record<TechnicalMotionDirection, number>>((result, item) => {
    result[item.direction] += item.confidence * Math.max(0.1, item.weight);
    return result;
  }, { devant: 0, a_la_seconde: 0, derriere: 0, undetermined: 0 });
  const determinedTotal = weighted.devant + weighted.a_la_seconde + weighted.derriere;
  const winner = (['devant', 'a_la_seconde', 'derriere'] as const)
    .reduce((best, candidate) => weighted[candidate] > weighted[best] ? candidate : best, 'devant');
  const share = determinedTotal > 0 ? weighted[winner] / determinedTotal : 0;
  if (share < 0.65 || weighted[winner] <= 0) {
    return Object.freeze({ direction: 'undetermined', confidence: clamp01(share * 0.4) });
  }
  const matching = classified.filter(item => item.direction === winner);
  return Object.freeze({
    direction: winner,
    confidence: clamp01(median(matching.map(item => item.confidence)) * share),
  });
}

export function detectTechnicalMotionPhases(
  exerciseId: TechnicalMotionId,
  samples: readonly TechnicalMotionSample[],
): TechnicalMotionPhaseDetection | null {
  if (samples.length < 20) return null;
  const nominalStepMs = nominalFrameStepMs(samples);
  if (nominalStepMs === null) return null;
  const spans = temporalSpans(samples, nominalStepMs);
  if (spans.length === 0) return null;
  let workingSide: 'left' | 'right' | null = null;
  let direction: TechnicalMotionDirection | null = null;
  let directionConfidence = 0;
  let observed: readonly boolean[];
  let cores: readonly ExcursionCore[];
  let selectedPath: readonly OptionalPoint[] | null = null;
  let sideConfidence = 1;

  if (exerciseId === 'changement') {
    const analysis = analyzeChangement(samples, spans);
    observed = analysis.observed;
    cores = analysis.cores;
  } else {
    const left = analyzeFootSide(exerciseId, samples, spans, 'left');
    const right = analyzeFootSide(exerciseId, samples, spans, 'right');
    if (left.cores.length === 0 && right.cores.length === 0) return null;
    const dominant = right.score >= left.score ? right : left;
    const secondary = dominant === right ? left : right;
    workingSide = dominant === right ? 'right' : 'left';
    sideConfidence = clamp01((dominant.score - secondary.score) / Math.max(0.001, dominant.score));
    observed = dominant.observed;
    cores = dominant.cores;
    selectedPath = dominant.path;
  }

  const built = buildBoundaries(exerciseId, cores, samples.length, observed);
  if (!built) return null;
  if (exerciseId === 'jete' && selectedPath) {
    const classified = consensusDirection(samples, selectedPath, cores);
    direction = classified.direction;
    directionConfidence = classified.confidence;
  }
  const cycleShapeConfidence = median(cores.map(core => core.shapeConfidence));
  const boundaryConfidence = median(built.boundaries.map(boundary => boundary.confidence));
  const confidence = clamp01(
    boundaryConfidence * 0.65
    + cycleShapeConfidence * 0.25
    + sideConfidence * 0.1,
  );
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
