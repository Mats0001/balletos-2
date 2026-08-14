import type { BalletMotionId } from '../types/motionRegistry';
import { resolveStudentId } from './studentRegistry';

/**
 * Context dimensions that are real capture inputs in the current V1 UI.
 *
 * Working side and camera view are deliberately absent: today they are
 * analysis outputs, not teacher-selected capture inputs. There is likewise no
 * selectable capture protocol yet. `levelId` is App.selectedAgeGroup; the
 * RightInspector's local norm preview is explicitly not a capture-level input.
 * Adding any absent dimension requires a real control and a new schema version
 * instead of inventing values here.
 * `sourceId` is the runtime source identity currently available to the app; a
 * content hash belongs to the later artifact/cache contract.
 */
export type AnalysisContextV1 = Readonly<{
  schemaVersion: 1;
  sourceId: string;
  studentId: string;
  exerciseId: BalletMotionId;
  levelId: 'minis' | 'kids' | 'teens' | 'adults' | 'masterclass';
}>;

export type AnalysisContextEpochV1 = Readonly<{
  context: AnalysisContextV1;
  fingerprint: string;
  generation: number;
}>;

// Raw pose frames are a separate, source/model-scoped artifact. This envelope
// binds only the derived pedagogical assessment and never owns or invalidates
// the reusable pose-frame cache.
export type BoundAssessmentV1<T> = Readonly<{
  schemaVersion: 1;
  contextFingerprint: string;
  contextGeneration: number;
  value: T;
}>;

export type AssessmentCapabilities = Readonly<{
  canSaveAttempt: boolean;
  canUseAvatar: boolean;
  canCompareReferences: boolean;
  canUseFeedback: boolean;
}>;

const BLOCKED_CAPABILITIES: AssessmentCapabilities = Object.freeze({
  canSaveAttempt: false,
  canUseAvatar: false,
  canCompareReferences: false,
  canUseFeedback: false,
});

const CURRENT_CAPABILITIES: AssessmentCapabilities = Object.freeze({
  canSaveAttempt: true,
  canUseAvatar: true,
  canCompareReferences: true,
  canUseFeedback: true,
});

const CURRENT_LEVEL_IDS: Readonly<Record<string, AnalysisContextV1['levelId']>> = Object.freeze({
  MINIS: 'minis',
  KIDS: 'kids',
  TEENS: 'teens',
  ERWACHSENE: 'adults',
  MASTERCLASS: 'masterclass',
});

export function resolveCurrentStudentId(selection: string): string | null {
  return resolveStudentId(selection);
}

export function resolveCurrentLevelId(selection: string): AnalysisContextV1['levelId'] | null {
  return CURRENT_LEVEL_IDS[selection.trim().toLocaleUpperCase('de-DE')] ?? null;
}

export function createAnalysisContextV1(input: Readonly<{
  sourceId: string;
  studentSelection: string;
  exerciseId: BalletMotionId;
  levelSelection: string;
}>): AnalysisContextV1 | null {
  const sourceId = input.sourceId.trim();
  const studentId = resolveCurrentStudentId(input.studentSelection);
  const levelId = resolveCurrentLevelId(input.levelSelection);
  if (!sourceId || !studentId || !levelId) return null;
  return Object.freeze({
    schemaVersion: 1,
    sourceId,
    studentId,
    exerciseId: input.exerciseId,
    levelId,
  });
}

/** Stable, canonical serialization of IDs only; never display labels. */
export function analysisContextFingerprint(context: AnalysisContextV1): string {
  return JSON.stringify([
    context.schemaVersion,
    context.sourceId,
    context.studentId,
    context.exerciseId,
    context.levelId,
  ]);
}

export function createAnalysisContextEpoch(
  context: AnalysisContextV1,
  generation: number,
): AnalysisContextEpochV1 {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new Error('Analysis context generation must be a non-negative safe integer.');
  }
  return Object.freeze({
    context,
    fingerprint: analysisContextFingerprint(context),
    generation,
  });
}

export function sameAnalysisContextEpoch(
  left: AnalysisContextEpochV1 | null,
  right: AnalysisContextEpochV1 | null,
): boolean {
  return Boolean(left && right
    && left.fingerprint === right.fingerprint
    && left.generation === right.generation);
}

/**
 * Publish only into the exact context epoch that started the assessment.
 * This closes late-result races, including change-away-and-back sequences.
 */
export function bindAssessmentIfCurrent<T>(
  startedFor: AnalysisContextEpochV1 | null,
  current: AnalysisContextEpochV1 | null,
  value: T,
): BoundAssessmentV1<T> | null {
  if (!sameAnalysisContextEpoch(startedFor, current) || !startedFor) return null;
  return Object.freeze({
    schemaVersion: 1,
    contextFingerprint: startedFor.fingerprint,
    contextGeneration: startedFor.generation,
    value,
  });
}

export function assessmentValueForCurrentContext<T>(
  assessment: BoundAssessmentV1<T> | null,
  current: AnalysisContextEpochV1 | null,
): T | null {
  if (!assessment || !current
    || assessment.contextFingerprint !== current.fingerprint
    || assessment.contextGeneration !== current.generation) return null;
  return assessment.value;
}

export function assessmentCapabilitiesForCurrentContext<T>(
  assessment: BoundAssessmentV1<T> | null,
  current: AnalysisContextEpochV1 | null,
): AssessmentCapabilities {
  return assessmentValueForCurrentContext(assessment, current) === null
    ? BLOCKED_CAPABILITIES
    : CURRENT_CAPABILITIES;
}
