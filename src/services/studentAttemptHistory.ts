import {
  heuristicBaseState,
  heuristicEvidenceStrength,
  TEACHER_REGION_KEYS,
  type TeacherEvidenceStrength,
  type TeacherHeuristicBaseState,
  type TeacherRegionKey,
} from '../types/teacherHeuristic';
import type {
  RecordingGateResult,
  TeacherPhaseAnalysis,
  TeacherPhaseId,
  TeacherPhaseResult,
} from './teacherPhaseAnalysis';
import { isBundledNicoleTestClip } from './referenceSourcePolicy';
import { MOTION_REGISTRY } from './motionRegistry';

const STORAGE_KEY = 'balletos_student_attempt_history_v1';
const MAX_RECORDS = 60;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type AttemptRegionSnapshot = Readonly<{
  state: TeacherHeuristicBaseState | null;
  evidenceStrength: TeacherEvidenceStrength;
}>;

export type AttemptPhaseSnapshot = Readonly<{
  id: TeacherPhaseId;
  cycleIndex: number;
  label: string;
  phaseConfidence?: number;
  motion?: Readonly<{
    durationMs: number;
    workingFootPathLength: number | null;
    workingFootJitter: number | null;
    sampleCount: number;
  }>;
  regions: Readonly<Record<TeacherRegionKey, AttemptRegionSnapshot>>;
}>;

export type StudentAttemptSnapshot = Readonly<{
  schemaVersion: 1;
  attemptId: string;
  studentKey: string;
  studentLabel: string;
  sourceId: string;
  sourceRole: 'student_attempt' | 'test_recording';
  referenceAuthority: 'none';
  capturedAt: string;
  exerciseId: TeacherPhaseAnalysis['exerciseId'];
  exerciseLabel: string;
  levelLabel: string;
  perspective: RecordingGateResult['detectedPerspective'];
  workingSide: TeacherPhaseAnalysis['workingSide'];
  gateStatus: Exclude<RecordingGateResult['status'], 'needs_correction'>;
  cycleCount: number;
  policyVersion: string;
  phases: readonly AttemptPhaseSnapshot[];
}>;

export type AttemptPhaseComparison = Readonly<{
  previousAttemptId: string;
  previousCapturedAt: string;
  phaseId: TeacherPhaseId;
  improved: number;
  unchanged: number;
  needsMoreAttention: number;
  comparableRegions: number;
  provisional: boolean;
  motion: Readonly<{
    footPathLengthDeltaPercent: number | null;
    jitterDeltaPercent: number | null;
    durationDeltaPercent: number | null;
    steadinessTrend: 'steadier' | 'similar' | 'more_restless' | 'not_comparable';
  }>;
  regions: Readonly<Partial<Record<TeacherRegionKey, 'improved' | 'unchanged' | 'needs_more_attention'>>>;
}>;

export type AttemptProgressPoint = Readonly<{
  phaseId: TeacherPhaseId;
  label: string;
  score: number;
  provisional: boolean;
}>;

type AttemptHistoryEnvelope = Readonly<{
  schemaVersion: 1;
  records: readonly StudentAttemptSnapshot[];
}>;

export const ATTEMPT_REGION_LABELS: Readonly<Record<TeacherRegionKey, string>> = Object.freeze({
  torsoAlignment: 'Rumpfachse',
  spine: 'Wirbelsäule',
  shoulder: 'Schultern',
  pelvis: 'Becken',
  armL: 'Arm links',
  armR: 'Arm rechts',
  legL: 'Bein links',
  legR: 'Bein rechts',
  footL: 'Fuß links',
  footR: 'Fuß rechts',
  cog: 'Gewichtsorganisation',
  head: 'Kopf',
});

function objectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function regionSnapshotIsValid(value: unknown): value is AttemptRegionSnapshot {
  if (!objectLike(value)) return false;
  return (value.state === null
    || value.state === 'heuristic_match'
    || value.state === 'heuristic_attention'
    || value.state === 'heuristic_strong_attention')
    && (value.evidenceStrength === 'stable'
      || value.evidenceStrength === 'uncertain'
      || value.evidenceStrength === 'weak');
}

function phaseSnapshotIsValid(value: unknown): value is AttemptPhaseSnapshot {
  if (!objectLike(value)
    || !stringValue(value.id)
    || !Number.isInteger(value.cycleIndex)
    || (value.cycleIndex as number) < 0
    || !stringValue(value.label)
    || !objectLike(value.regions)) return false;
  if (value.phaseConfidence !== undefined && (!Number.isFinite(value.phaseConfidence) || (value.phaseConfidence as number) < 0 || (value.phaseConfidence as number) > 1)) return false;
  if (value.motion !== undefined) {
    if (!objectLike(value.motion)
      || !Number.isFinite(value.motion.durationMs) || (value.motion.durationMs as number) < 0
      || !Number.isInteger(value.motion.sampleCount) || (value.motion.sampleCount as number) < 0
      || !(value.motion.workingFootPathLength === null || (Number.isFinite(value.motion.workingFootPathLength) && (value.motion.workingFootPathLength as number) >= 0))
      || !(value.motion.workingFootJitter === null || (Number.isFinite(value.motion.workingFootJitter) && (value.motion.workingFootJitter as number) >= 0))) return false;
  }
  const regions = value.regions;
  return TEACHER_REGION_KEYS.every(key => regionSnapshotIsValid(regions[key]));
}

export function studentAttemptSnapshotIsValid(value: unknown): value is StudentAttemptSnapshot {
  if (!objectLike(value)) return false;
  return value.schemaVersion === 1
    && stringValue(value.attemptId)
    && stringValue(value.studentKey)
    && stringValue(value.studentLabel)
    && stringValue(value.sourceId)
    && (value.sourceRole === 'student_attempt' || value.sourceRole === 'test_recording')
    && value.referenceAuthority === 'none'
    && stringValue(value.capturedAt)
    && !Number.isNaN(Date.parse(value.capturedAt as string))
    && MOTION_REGISTRY.some(entry => entry.id === value.exerciseId)
    && stringValue(value.exerciseLabel)
    && stringValue(value.levelLabel)
    && (value.perspective === null
      || value.perspective === 'FRONTAL'
      || value.perspective === 'PROFILE_LEFT'
      || value.perspective === 'PROFILE_RIGHT')
    && (value.workingSide === null || value.workingSide === 'left' || value.workingSide === 'right')
    && (value.gateStatus === 'ready' || value.gateStatus === 'usable_with_caution')
    && Number.isInteger(value.cycleCount)
    && (value.cycleCount as number) > 0
    && stringValue(value.policyVersion)
    && Array.isArray(value.phases)
    && value.phases.length > 0
    && value.phases.every(phaseSnapshotIsValid);
}

function envelopeIsValid(value: unknown): value is AttemptHistoryEnvelope {
  if (!objectLike(value) || value.schemaVersion !== 1 || !Array.isArray(value.records)) return false;
  if (!value.records.every(studentAttemptSnapshotIsValid)) return false;
  const ids = new Set(value.records.map(record => record.attemptId));
  return ids.size === value.records.length;
}

export function studentKeyFromLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function snapshotPhase(phase: TeacherPhaseResult): AttemptPhaseSnapshot {
  return Object.freeze({
    id: phase.id,
    cycleIndex: phase.cycleIndex,
    label: phase.label,
    phaseConfidence: phase.confidence,
    motion: Object.freeze({ ...phase.motion }),
    regions: Object.freeze(Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, Object.freeze({
      state: heuristicBaseState(phase.regions[key].state),
      evidenceStrength: heuristicEvidenceStrength(phase.regions[key].state),
    })])) as Record<TeacherRegionKey, AttemptRegionSnapshot>),
  });
}

export function createStudentAttemptSnapshot(input: Readonly<{
  analysis: TeacherPhaseAnalysis;
  studentLabel: string;
  sourceId: string;
  now?: () => Date;
  createId?: () => string;
}>): StudentAttemptSnapshot | null {
  const studentLabel = input.studentLabel.trim();
  const studentKey = studentKeyFromLabel(studentLabel);
  const sourceId = input.sourceId.trim();
  if (!studentKey
    || !sourceId
    || input.analysis.gate.status === 'needs_correction'
    || input.analysis.phases.length === 0
    || input.analysis.cycleCount <= 0) return null;
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? (() => crypto.randomUUID());
  const record: StudentAttemptSnapshot = Object.freeze({
    schemaVersion: 1,
    attemptId: createId(),
    studentKey,
    studentLabel,
    sourceId,
    sourceRole: isBundledNicoleTestClip(sourceId) ? 'test_recording' : 'student_attempt',
    referenceAuthority: 'none',
    capturedAt: now().toISOString(),
    exerciseId: input.analysis.exerciseId,
    exerciseLabel: input.analysis.exerciseLabel,
    levelLabel: input.analysis.levelLabel,
    perspective: input.analysis.gate.detectedPerspective,
    workingSide: input.analysis.workingSide,
    gateStatus: input.analysis.gate.status,
    cycleCount: input.analysis.cycleCount,
    policyVersion: input.analysis.policyVersion,
    phases: Object.freeze(input.analysis.phases.map(snapshotPhase)),
  });
  return studentAttemptSnapshotIsValid(record) ? record : null;
}

function comparable(record: StudentAttemptSnapshot, current: StudentAttemptSnapshot): boolean {
  return record.studentKey === current.studentKey
    && record.sourceId !== current.sourceId
    && record.exerciseId === current.exerciseId
    && record.levelLabel === current.levelLabel
    && record.perspective === current.perspective
    && record.workingSide === current.workingSide;
}

export function findPreviousComparableAttempt(
  records: readonly StudentAttemptSnapshot[],
  current: StudentAttemptSnapshot,
): StudentAttemptSnapshot | null {
  return records
    .filter(record => comparable(record, current))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;
}

function severity(state: TeacherHeuristicBaseState): number {
  return state === 'heuristic_match' ? 0 : state === 'heuristic_attention' ? 1 : 2;
}

function arithmeticMean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function comparePhaseWithAttempt(
  phase: TeacherPhaseResult | null,
  previous: StudentAttemptSnapshot | null,
): AttemptPhaseComparison | null {
  if (!phase || !previous) return null;
  const previousPhases = previous.phases.filter(candidate => candidate.id === phase.id);
  if (previousPhases.length === 0) return null;
  const regions: Partial<Record<TeacherRegionKey, 'improved' | 'unchanged' | 'needs_more_attention'>> = {};
  let improved = 0;
  let unchanged = 0;
  let needsMoreAttention = 0;
  let provisional = false;
  for (const key of TEACHER_REGION_KEYS) {
    const currentState = heuristicBaseState(phase.regions[key].state);
    const historicStates = previousPhases.flatMap(candidate => candidate.regions[key].state ?? []);
    if (!currentState || historicStates.length === 0) continue;
    const historicMean = historicStates.reduce((sum, value) => sum + severity(value), 0) / historicStates.length;
    const delta = severity(currentState) - historicMean;
    const trend = delta <= -0.5
      ? 'improved'
      : delta >= 0.5
        ? 'needs_more_attention'
        : 'unchanged';
    regions[key] = trend;
    if (trend === 'improved') improved++;
    else if (trend === 'needs_more_attention') needsMoreAttention++;
    else unchanged++;
    if (heuristicEvidenceStrength(phase.regions[key].state) !== 'stable'
      || previousPhases.some(candidate => candidate.regions[key].evidenceStrength !== 'stable')) {
      provisional = true;
    }
  }
  const comparableRegions = improved + unchanged + needsMoreAttention;
  if (comparableRegions === 0) return null;
  const previousMotion = previousPhases.map(candidate => candidate.motion).filter((value): value is NonNullable<AttemptPhaseSnapshot['motion']> => Boolean(value));
  const percentDelta = (current: number | null, historic: readonly (number | null)[]) => {
    const usable = historic.filter((value): value is number => value !== null && Number.isFinite(value));
    if (current === null || !Number.isFinite(current) || usable.length === 0) return null;
    const baseline = arithmeticMean(usable);
    return Math.abs(baseline) <= 1e-9 ? null : Math.round((current - baseline) / baseline * 100);
  };
  const footPathLengthDeltaPercent = percentDelta(
    phase.motion.workingFootPathLength,
    previousMotion.map(motion => motion.workingFootPathLength),
  );
  const jitterDeltaPercent = percentDelta(
    phase.motion.workingFootJitter,
    previousMotion.map(motion => motion.workingFootJitter),
  );
  const durationDeltaPercent = percentDelta(phase.motion.durationMs, previousMotion.map(motion => motion.durationMs));
  const steadinessTrend = jitterDeltaPercent === null ? 'not_comparable'
    : jitterDeltaPercent <= -12 ? 'steadier'
      : jitterDeltaPercent >= 12 ? 'more_restless'
        : 'similar';
  return Object.freeze({
    previousAttemptId: previous.attemptId,
    previousCapturedAt: previous.capturedAt,
    phaseId: phase.id,
    improved,
    unchanged,
    needsMoreAttention,
    comparableRegions,
    provisional,
    motion: Object.freeze({ footPathLengthDeltaPercent, jitterDeltaPercent, durationDeltaPercent, steadinessTrend }),
    regions: Object.freeze(regions),
  });
}

/** Compact cross-phase curve; positive means more stable than the previous comparable attempt. */
export function buildAttemptProgressCurve(
  current: StudentAttemptSnapshot | null,
  previous: StudentAttemptSnapshot | null,
): readonly AttemptProgressPoint[] {
  if (!current || !previous) return Object.freeze([]);
  return Object.freeze(current.phases.map(phase => {
    const historic = previous.phases.filter(candidate => candidate.id === phase.id);
    if (historic.length === 0) return Object.freeze({ phaseId: phase.id, label: phase.label, score: 0, provisional: true });
    const deltas = TEACHER_REGION_KEYS.flatMap(key => {
      const currentState = phase.regions[key].state;
      const old = historic.flatMap(candidate => candidate.regions[key].state ?? []);
      return currentState && old.length > 0 ? [arithmeticMean(old.map(severity)) - severity(currentState)] : [];
    });
    let score = deltas.length > 0 ? arithmeticMean(deltas) / 2 : 0;
    const currentJitter = phase.motion?.workingFootJitter;
    const oldJitter = historic.flatMap(candidate => candidate.motion?.workingFootJitter ?? []);
    if (currentJitter !== null && currentJitter !== undefined && oldJitter.length > 0) {
      const baseline = arithmeticMean(oldJitter);
      if (baseline > 1e-9) score += Math.max(-0.5, Math.min(0.5, (baseline - currentJitter) / baseline * 0.35));
    }
    return Object.freeze({
      phaseId: phase.id,
      label: phase.label,
      score: Math.max(-1, Math.min(1, Number(score.toFixed(3)))),
      provisional: phase.phaseConfidence === undefined || phase.phaseConfidence < 0.7
        || Object.values(phase.regions).some(region => region.evidenceStrength !== 'stable'),
    });
  }));
}

export class StudentAttemptHistoryStore {
  constructor(private readonly storage: StorageLike) {}

  list(): readonly StudentAttemptSnapshot[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return envelopeIsValid(parsed) ? Object.freeze([...parsed.records]) : [];
    } catch {
      return [];
    }
  }

  save(record: StudentAttemptSnapshot): StudentAttemptSnapshot {
    if (!studentAttemptSnapshotIsValid(record)) throw new Error('Versuchsdaten sind ungültig.');
    const records = [...this.list()];
    const existing = records.find(candidate => (
      candidate.studentKey === record.studentKey
      && candidate.sourceId === record.sourceId
      && candidate.exerciseId === record.exerciseId
      && candidate.levelLabel === record.levelLabel
    ));
    if (existing) return existing;
    const next = [...records, record]
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
      .slice(-MAX_RECORDS);
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, records: next } satisfies AttemptHistoryEnvelope));
    return record;
  }
}

export const studentAttemptHistory = new StudentAttemptHistoryStore(localStorage);
