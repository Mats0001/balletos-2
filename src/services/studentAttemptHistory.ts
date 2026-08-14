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
import { resolveStudentRegistryEntry } from './studentRegistry';

const STORAGE_KEY = 'balletos_student_attempt_history_v2';
const LEGACY_STORAGE_KEY = 'balletos_student_attempt_history_v1';
const MAX_RECORDS = 60;

const ENVELOPE_KEYS = Object.freeze(['schemaVersion', 'records']);
const SNAPSHOT_V2_KEYS = Object.freeze([
  'schemaVersion', 'attemptId', 'studentId', 'studentLabel', 'sourceId', 'sourceRole',
  'referenceAuthority', 'capturedAt', 'exerciseId', 'exerciseLabel', 'levelLabel',
  'perspective', 'workingSide', 'direction', 'gateStatus', 'cycleCount', 'policyVersion', 'phases',
]);
const SNAPSHOT_V1_KEYS = Object.freeze([
  'schemaVersion', 'attemptId', 'studentKey', 'studentLabel', 'sourceId', 'sourceRole',
  'referenceAuthority', 'capturedAt', 'exerciseId', 'exerciseLabel', 'levelLabel',
  'perspective', 'workingSide', 'gateStatus', 'cycleCount', 'policyVersion', 'phases',
]);
const PHASE_KEYS = Object.freeze(['id', 'cycleIndex', 'label', 'phaseConfidence', 'motion', 'regions']);
const MOTION_KEYS = Object.freeze(['durationMs', 'workingFootPathLength', 'workingFootJitter', 'sampleCount']);
const REGION_KEYS = Object.freeze(['state', 'evidenceStrength']);

const ATTEMPT_PHASE_IDS_BY_EXERCISE: Readonly<Record<TeacherPhaseAnalysis['exerciseId'], readonly TeacherPhaseId[]>> = Object.freeze({
  plie: Object.freeze(['setup', 'descent', 'bottom', 'ascent', 'finish'] as const),
  tendu: Object.freeze(['departure', 'extension', 'full_extension', 'return', 'closure'] as const),
  passe: Object.freeze(['preparation', 'lift', 'placement', 'lower', 'finish'] as const),
  jete: Object.freeze(['preparation', 'brush', 'release', 'return', 'finish'] as const),
  changement: Object.freeze(['preparation', 'takeoff', 'flight', 'landing', 'finish'] as const),
});

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
  schemaVersion: 2;
  attemptId: string;
  studentId: string;
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
  direction: TeacherPhaseAnalysis['direction'];
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

export type StudentProgressSummary = Readonly<{
  summaryId: string;
  studentId: string;
  studentLabel: string;
  exerciseId: StudentAttemptSnapshot['exerciseId'];
  exerciseLabel: string;
  levelLabel: string;
  perspective: StudentAttemptSnapshot['perspective'];
  workingSide: StudentAttemptSnapshot['workingSide'];
  direction: StudentAttemptSnapshot['direction'];
  policyVersion: string;
  attemptCount: number;
  latestAttemptId: string;
  latestCapturedAt: string;
  previousAttemptId: string;
  previousCapturedAt: string;
  averagePhaseScore: number;
  phaseTrend: 'improved' | 'similar' | 'needs_more_attention';
  provisional: boolean;
  comparablePhaseCount: number;
  footPathDeltaPercent: number | null;
  jitterDeltaPercent: number | null;
  steadinessTrend: 'steadier' | 'similar' | 'more_restless' | 'not_comparable';
}>;

type AttemptHistoryEnvelope = Readonly<{
  schemaVersion: 2;
  records: readonly StudentAttemptSnapshot[];
}>;

type LegacyStudentAttemptSnapshotV1 = Omit<StudentAttemptSnapshot, 'schemaVersion' | 'studentId' | 'direction'> & Readonly<{
  schemaVersion: 1;
  studentKey: string;
}>;

type LegacyAttemptHistoryEnvelopeV1 = Readonly<{
  schemaVersion: 1;
  records: readonly LegacyStudentAttemptSnapshotV1[];
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

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every(key => allowedKeys.has(key));
}

function regionSnapshotIsValid(value: unknown): value is AttemptRegionSnapshot {
  if (!objectLike(value) || !hasOnlyKeys(value, REGION_KEYS)) return false;
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
    || !hasOnlyKeys(value, PHASE_KEYS)
    || !stringValue(value.id)
    || !Number.isInteger(value.cycleIndex)
    || (value.cycleIndex as number) < 0
    || !stringValue(value.label)
    || !objectLike(value.regions)) return false;
  if (value.phaseConfidence !== undefined && (!Number.isFinite(value.phaseConfidence) || (value.phaseConfidence as number) < 0 || (value.phaseConfidence as number) > 1)) return false;
  if (value.motion !== undefined) {
    if (!objectLike(value.motion)
      || !hasOnlyKeys(value.motion, MOTION_KEYS)
      || !Number.isFinite(value.motion.durationMs) || (value.motion.durationMs as number) < 0
      || !Number.isInteger(value.motion.sampleCount) || (value.motion.sampleCount as number) < 0
      || !(value.motion.workingFootPathLength === null || (Number.isFinite(value.motion.workingFootPathLength) && (value.motion.workingFootPathLength as number) >= 0))
      || !(value.motion.workingFootJitter === null || (Number.isFinite(value.motion.workingFootJitter) && (value.motion.workingFootJitter as number) >= 0))) return false;
  }
  const regions = value.regions;
  return Object.keys(regions).length === TEACHER_REGION_KEYS.length
    && TEACHER_REGION_KEYS.every(key => regionSnapshotIsValid(regions[key]));
}

export function studentAttemptSnapshotIsValid(value: unknown): value is StudentAttemptSnapshot {
  if (!objectLike(value) || !hasOnlyKeys(value, SNAPSHOT_V2_KEYS)) return false;
  const student = typeof value.studentId === 'string'
    ? resolveStudentRegistryEntry(value.studentId)
    : null;
  const motion = MOTION_REGISTRY.find(entry => entry.id === value.exerciseId);
  return value.schemaVersion === 2
    && stringValue(value.attemptId)
    && stringValue(value.studentId)
    && student?.studentId === value.studentId
    && value.studentLabel === student.displayName
    && stringValue(value.sourceId)
    && (value.sourceRole === 'student_attempt' || value.sourceRole === 'test_recording')
    && value.referenceAuthority === 'none'
    && stringValue(value.capturedAt)
    && !Number.isNaN(Date.parse(value.capturedAt as string))
    && motion !== undefined
    && value.exerciseLabel === motion.label
    && stringValue(value.levelLabel)
    && (value.perspective === null
      || value.perspective === 'FRONTAL'
      || value.perspective === 'PROFILE_LEFT'
      || value.perspective === 'PROFILE_RIGHT')
    && (value.workingSide === null || value.workingSide === 'left' || value.workingSide === 'right')
    && (value.direction === null
      || value.direction === 'devant'
      || value.direction === 'a_la_seconde'
      || value.direction === 'derriere'
      || value.direction === 'undetermined')
    && (value.gateStatus === 'ready' || value.gateStatus === 'usable_with_caution')
    && Number.isInteger(value.cycleCount)
    && (value.cycleCount as number) > 0
    && stringValue(value.policyVersion)
    && Array.isArray(value.phases)
    && value.phases.length > 0
    && value.phases.every(phaseSnapshotIsValid)
    && value.phases.every(phase => ATTEMPT_PHASE_IDS_BY_EXERCISE[motion.id].includes(phase.id));
}

function legacyStudentAttemptSnapshotIsValid(value: unknown): value is LegacyStudentAttemptSnapshotV1 {
  if (!objectLike(value) || !hasOnlyKeys(value, SNAPSHOT_V1_KEYS)) return false;
  const motion = MOTION_REGISTRY.find(entry => entry.id === value.exerciseId);
  return value.schemaVersion === 1
    && stringValue(value.attemptId)
    && stringValue(value.studentKey)
    && stringValue(value.studentLabel)
    && stringValue(value.sourceId)
    && (value.sourceRole === 'student_attempt' || value.sourceRole === 'test_recording')
    && value.referenceAuthority === 'none'
    && stringValue(value.capturedAt)
    && !Number.isNaN(Date.parse(value.capturedAt as string))
    && motion !== undefined
    && value.exerciseLabel === motion.label
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
    && value.phases.every(phaseSnapshotIsValid)
    && value.phases.every(phase => ATTEMPT_PHASE_IDS_BY_EXERCISE[motion.id].includes(phase.id));
}

function envelopeIsValid(value: unknown): value is AttemptHistoryEnvelope {
  if (!objectLike(value)
    || !hasOnlyKeys(value, ENVELOPE_KEYS)
    || value.schemaVersion !== 2
    || !Array.isArray(value.records)) return false;
  if (!value.records.every(studentAttemptSnapshotIsValid)) return false;
  const ids = new Set(value.records.map(record => record.attemptId));
  return ids.size === value.records.length;
}

function legacyEnvelopeIsValid(value: unknown): value is LegacyAttemptHistoryEnvelopeV1 {
  if (!objectLike(value)
    || !hasOnlyKeys(value, ENVELOPE_KEYS)
    || value.schemaVersion !== 1
    || !Array.isArray(value.records)) return false;
  if (!value.records.every(legacyStudentAttemptSnapshotIsValid)) return false;
  const ids = new Set(value.records.map(record => record.attemptId));
  return ids.size === value.records.length;
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

function freezeAttemptSnapshot(record: StudentAttemptSnapshot): StudentAttemptSnapshot {
  return Object.freeze({
    schemaVersion: 2,
    attemptId: record.attemptId,
    studentId: record.studentId,
    studentLabel: record.studentLabel,
    sourceId: record.sourceId,
    sourceRole: record.sourceRole,
    referenceAuthority: 'none',
    capturedAt: record.capturedAt,
    exerciseId: record.exerciseId,
    exerciseLabel: record.exerciseLabel,
    levelLabel: record.levelLabel,
    perspective: record.perspective,
    workingSide: record.workingSide,
    direction: record.direction,
    gateStatus: record.gateStatus,
    cycleCount: record.cycleCount,
    policyVersion: record.policyVersion,
    phases: Object.freeze(record.phases.map(phase => Object.freeze({
      id: phase.id,
      cycleIndex: phase.cycleIndex,
      label: phase.label,
      ...(phase.phaseConfidence === undefined ? {} : { phaseConfidence: phase.phaseConfidence }),
      ...(phase.motion === undefined ? {} : { motion: Object.freeze({
        durationMs: phase.motion.durationMs,
        workingFootPathLength: phase.motion.workingFootPathLength,
        workingFootJitter: phase.motion.workingFootJitter,
        sampleCount: phase.motion.sampleCount,
      }) }),
      regions: Object.freeze(Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, Object.freeze({
        state: phase.regions[key].state,
        evidenceStrength: phase.regions[key].evidenceStrength,
      })])) as Record<TeacherRegionKey, AttemptRegionSnapshot>),
    }))),
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
  const student = resolveStudentRegistryEntry(studentLabel);
  const sourceId = input.sourceId.trim();
  if (!student
    || !sourceId
    || input.analysis.gate.status === 'needs_correction'
    || input.analysis.phases.length === 0
    || input.analysis.cycleCount <= 0) return null;
  const now = input.now ?? (() => new Date());
  const createId = input.createId ?? (() => crypto.randomUUID());
  const record: StudentAttemptSnapshot = Object.freeze({
    schemaVersion: 2,
    attemptId: createId(),
    studentId: student.studentId,
    studentLabel: student.displayName,
    sourceId,
    sourceRole: isBundledNicoleTestClip(sourceId) ? 'test_recording' : 'student_attempt',
    referenceAuthority: 'none',
    capturedAt: now().toISOString(),
    exerciseId: input.analysis.exerciseId,
    exerciseLabel: input.analysis.exerciseLabel,
    levelLabel: input.analysis.levelLabel,
    perspective: input.analysis.gate.detectedPerspective,
    workingSide: input.analysis.workingSide,
    direction: input.analysis.direction,
    gateStatus: input.analysis.gate.status,
    cycleCount: input.analysis.cycleCount,
    policyVersion: input.analysis.policyVersion,
    phases: Object.freeze(input.analysis.phases.map(snapshotPhase)),
  });
  return studentAttemptSnapshotIsValid(record) ? freezeAttemptSnapshot(record) : null;
}

function comparable(record: StudentAttemptSnapshot, current: StudentAttemptSnapshot): boolean {
  return comparisonContextIsComplete(record)
    && comparisonContextIsComplete(current)
    && record.studentId === current.studentId
    && record.sourceId !== current.sourceId
    && record.exerciseId === current.exerciseId
    && record.levelLabel === current.levelLabel
    && record.perspective === current.perspective
    && record.workingSide === current.workingSide
    && record.direction === current.direction
    && record.policyVersion === current.policyVersion;
}

function comparisonContextIsComplete(record: StudentAttemptSnapshot): boolean {
  if (record.perspective === null) return false;
  if ((record.exerciseId === 'tendu' || record.exerciseId === 'passe' || record.exerciseId === 'jete')
    && record.workingSide === null) return false;
  if ((record.exerciseId === 'tendu' || record.exerciseId === 'jete')
    && (record.direction === null || record.direction === 'undetermined')) return false;
  return true;
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
  return Object.freeze(current.phases.flatMap(phase => {
    const historic = previous.phases.filter(candidate => candidate.id === phase.id);
    if (historic.length === 0) return [];
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
    return [Object.freeze({
      phaseId: phase.id,
      label: phase.label,
      score: Math.max(-1, Math.min(1, Number(score.toFixed(3)))),
      provisional: phase.phaseConfidence === undefined || phase.phaseConfidence < 0.7
        || Object.values(phase.regions).some(region => region.evidenceStrength !== 'stable'),
    })];
  }));
}

function averageNullable(values: readonly (number | null | undefined)[]): number | null {
  const usable = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return usable.length > 0 ? arithmeticMean(usable) : null;
}

function percentDifference(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || Math.abs(previous) <= 1e-9) return null;
  return Math.round((current - previous) / previous * 100);
}

function progressGroupKey(record: StudentAttemptSnapshot): string {
  return JSON.stringify([
    record.studentId,
    record.exerciseId,
    record.levelLabel,
    record.perspective,
    record.workingSide,
    record.direction,
    record.policyVersion,
  ]);
}

/**
 * Builds one latest-vs-previous summary per comparable capture context.
 * It never turns a student attempt into a pedagogical reference or score.
 */
export function buildStudentProgressSummaries(
  records: readonly StudentAttemptSnapshot[],
): readonly StudentProgressSummary[] {
  const groups = new Map<string, StudentAttemptSnapshot[]>();
  for (const record of records) {
    if (!studentAttemptSnapshotIsValid(record) || !comparisonContextIsComplete(record)) continue;
    const key = progressGroupKey(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const summaries: StudentProgressSummary[] = [];
  for (const [summaryId, group] of groups) {
    const ordered = group.slice().sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    const latest = ordered[0];
    const previous = ordered.find(candidate => candidate.sourceId !== latest?.sourceId);
    if (!latest || !previous) continue;
    const curve = buildAttemptProgressCurve(latest, previous);
    if (curve.length === 0) continue;
    const previousPhaseIds = new Set(previous.phases.map(phase => phase.id));
    const commonPhaseIds = new Set(latest.phases.map(phase => phase.id).filter(id => previousPhaseIds.has(id)));
    if (commonPhaseIds.size === 0) continue;
    const averagePhaseScore = Number(arithmeticMean(curve.map(point => point.score)).toFixed(3));
    const phaseTrend = averagePhaseScore > 0.08
      ? 'improved'
      : averagePhaseScore < -0.08
        ? 'needs_more_attention'
        : 'similar';
    const latestComparablePhases = latest.phases.filter(phase => commonPhaseIds.has(phase.id));
    const previousComparablePhases = previous.phases.filter(phase => commonPhaseIds.has(phase.id));
    const latestFootPath = averageNullable(latestComparablePhases.map(phase => phase.motion?.workingFootPathLength));
    const previousFootPath = averageNullable(previousComparablePhases.map(phase => phase.motion?.workingFootPathLength));
    const latestJitter = averageNullable(latestComparablePhases.map(phase => phase.motion?.workingFootJitter));
    const previousJitter = averageNullable(previousComparablePhases.map(phase => phase.motion?.workingFootJitter));
    const footPathDeltaPercent = percentDifference(latestFootPath, previousFootPath);
    const jitterDeltaPercent = percentDifference(latestJitter, previousJitter);
    const steadinessTrend = jitterDeltaPercent === null
      ? 'not_comparable'
      : jitterDeltaPercent <= -12
        ? 'steadier'
        : jitterDeltaPercent >= 12
          ? 'more_restless'
          : 'similar';
    const comparablePhaseCount = commonPhaseIds.size;
    summaries.push(Object.freeze({
      summaryId,
      studentId: latest.studentId,
      studentLabel: latest.studentLabel,
      exerciseId: latest.exerciseId,
      exerciseLabel: latest.exerciseLabel,
      levelLabel: latest.levelLabel,
      perspective: latest.perspective,
      workingSide: latest.workingSide,
      direction: latest.direction,
      policyVersion: latest.policyVersion,
      attemptCount: new Set(ordered.map(record => record.sourceId)).size,
      latestAttemptId: latest.attemptId,
      latestCapturedAt: latest.capturedAt,
      previousAttemptId: previous.attemptId,
      previousCapturedAt: previous.capturedAt,
      averagePhaseScore,
      phaseTrend,
      provisional: latest.gateStatus !== 'ready'
        || previous.gateStatus !== 'ready'
        || curve.some(point => point.provisional),
      comparablePhaseCount,
      footPathDeltaPercent,
      jitterDeltaPercent,
      steadinessTrend,
    }));
  }

  return Object.freeze(summaries.sort((a, b) => Date.parse(b.latestCapturedAt) - Date.parse(a.latestCapturedAt)));
}

function migrateLegacyRecord(record: LegacyStudentAttemptSnapshotV1): StudentAttemptSnapshot | null {
  const labelStudent = resolveStudentRegistryEntry(record.studentLabel);
  const keyStudent = resolveStudentRegistryEntry(record.studentKey);
  if (!labelStudent || !keyStudent || labelStudent.studentId !== keyStudent.studentId) return null;
  const { studentKey, ...rest } = record;
  void studentKey;
  const migrated: StudentAttemptSnapshot = Object.freeze({
    ...rest,
    schemaVersion: 2,
    studentId: labelStudent.studentId,
    studentLabel: labelStudent.displayName,
    direction: null,
  });
  return studentAttemptSnapshotIsValid(migrated) ? freezeAttemptSnapshot(migrated) : null;
}

type AttemptHistoryReadResult = Readonly<{
  status: 'empty' | 'valid' | 'invalid';
  records: readonly StudentAttemptSnapshot[];
}>;

export class StudentAttemptHistoryStore {
  constructor(private readonly storage: StorageLike) {}

  private readRecords(): AttemptHistoryReadResult {
    try {
      const raw = this.storage.getItem(STORAGE_KEY) ?? this.storage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return Object.freeze({ status: 'empty', records: Object.freeze([]) });
      const parsed: unknown = JSON.parse(raw);
      if (envelopeIsValid(parsed)) return Object.freeze({
        status: 'valid',
        records: Object.freeze(parsed.records.map(freezeAttemptSnapshot)),
      });
      if (!legacyEnvelopeIsValid(parsed)) return Object.freeze({ status: 'invalid', records: Object.freeze([]) });
      const migrated = parsed.records.map(migrateLegacyRecord);
      return migrated.every((record): record is StudentAttemptSnapshot => record !== null)
        ? Object.freeze({ status: 'valid', records: Object.freeze(migrated) })
        : Object.freeze({ status: 'invalid', records: Object.freeze([]) });
    } catch {
      return Object.freeze({ status: 'invalid', records: Object.freeze([]) });
    }
  }

  list(): readonly StudentAttemptSnapshot[] {
    const result = this.readRecords();
    return result.status === 'valid' ? result.records : Object.freeze([]);
  }

  save(record: StudentAttemptSnapshot): StudentAttemptSnapshot {
    if (!studentAttemptSnapshotIsValid(record)) throw new Error('Versuchsdaten sind ungültig.');
    const readResult = this.readRecords();
    if (readResult.status === 'invalid') {
      throw new Error('Versuchshistorie konnte nicht sicher gelesen werden.');
    }
    const canonicalRecord = freezeAttemptSnapshot(record);
    const records = [...readResult.records];
    const existing = records.find(candidate => (
      candidate.studentId === canonicalRecord.studentId
      && candidate.sourceId === canonicalRecord.sourceId
      && candidate.exerciseId === canonicalRecord.exerciseId
      && candidate.levelLabel === canonicalRecord.levelLabel
      && candidate.perspective === canonicalRecord.perspective
      && candidate.workingSide === canonicalRecord.workingSide
      && candidate.direction === canonicalRecord.direction
      && candidate.policyVersion === canonicalRecord.policyVersion
    ));
    if (existing) return existing;
    const next = [...records, canonicalRecord]
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
      .slice(-MAX_RECORDS);
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 2, records: next } satisfies AttemptHistoryEnvelope));
    return canonicalRecord;
  }
}

export const studentAttemptHistory = new StudentAttemptHistoryStore(localStorage);
