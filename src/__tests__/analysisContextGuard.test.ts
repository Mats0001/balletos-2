import { describe, expect, it } from 'vitest';
import {
  analysisContextFingerprint,
  assessmentCapabilitiesForCurrentContext,
  assessmentValueForCurrentContext,
  bindAssessmentIfCurrent,
  createAnalysisContextEpoch,
  createAnalysisContextV1,
  resolveCurrentStudentId,
} from '../services/analysisContextGuard';

function context(overrides: Partial<Parameters<typeof createAnalysisContextV1>[0]> = {}) {
  return createAnalysisContextV1({
    sourceId: '/videos/nicole_saal_1.mp4',
    studentSelection: 'Emma',
    exerciseId: 'plie',
    levelSelection: 'MINIS',
    ...overrides,
  });
}

describe('analysisContextGuard V1', () => {
  it('uses stable current student, exercise, source and level IDs', () => {
    expect(resolveCurrentStudentId('Emma')).toBe('student:emma-berger');
    expect(resolveCurrentStudentId('Emma Berger (Minis)')).toBe('student:emma-berger');
    expect(context()).toEqual({
      schemaVersion: 1,
      sourceId: '/videos/nicole_saal_1.mp4',
      studentId: 'student:emma-berger',
      exerciseId: 'plie',
      levelId: 'minis',
    });
    expect(context({ studentSelection: 'unbekannt' })).toBeNull();
    expect(context({ levelSelection: 'unbekannt' })).toBeNull();
  });

  it('has a deterministic canonical fingerprint independent of display labels', () => {
    const shortSelection = context({ studentSelection: 'Emma' })!;
    const longSelection = context({ studentSelection: 'Emma Berger' })!;
    expect(analysisContextFingerprint(shortSelection)).toBe(analysisContextFingerprint(longSelection));
    expect(analysisContextFingerprint(shortSelection)).toBe(
      '[1,"/videos/nicole_saal_1.mp4","student:emma-berger","plie","minis"]',
    );
  });

  it.each([
    ['source', { sourceId: '/videos/nicole_saal_2.mp4' }],
    ['student', { studentSelection: 'Clara' }],
    ['exercise', { exerciseId: 'passe' as const }],
    ['level', { levelSelection: 'KIDS' }],
  ])('invalidates an assessment after a %s change', (_label, override) => {
    const original = createAnalysisContextEpoch(context()!, 0);
    const changed = createAnalysisContextEpoch(context(override)!, 1);
    const assessment = bindAssessmentIfCurrent(original, original, { gate: 'ready' });
    expect(assessmentValueForCurrentContext(assessment, changed)).toBeNull();
    expect(assessmentCapabilitiesForCurrentContext(assessment, changed)).toEqual({
      canSaveAttempt: false,
      canUseAvatar: false,
      canCompareReferences: false,
      canUseFeedback: false,
    });
  });

  it('enables every assessment consumer only for the exact bound epoch', () => {
    const current = createAnalysisContextEpoch(context({ exerciseId: 'passe' })!, 2);
    const assessment = bindAssessmentIfCurrent(current, current, { gate: 'ready' });
    expect(assessmentCapabilitiesForCurrentContext(assessment, current)).toEqual({
      canSaveAttempt: true,
      canUseAvatar: true,
      canCompareReferences: true,
      canUseFeedback: true,
    });
  });

  it('does not revive an artifact after switching away and back', () => {
    const original = createAnalysisContextEpoch(context()!, 3);
    const assessment = bindAssessmentIfCurrent(original, original, { gate: 'ready' });
    const away = createAnalysisContextEpoch(context({ exerciseId: 'passe' })!, 4);
    const back = createAnalysisContextEpoch(context()!, 5);
    expect(assessmentValueForCurrentContext(assessment, away)).toBeNull();
    expect(assessmentValueForCurrentContext(assessment, back)).toBeNull();
  });

  it('rejects a late result whose start epoch is no longer current', () => {
    const startedFor = createAnalysisContextEpoch(context()!, 8);
    const current = createAnalysisContextEpoch(context({ exerciseId: 'passe' })!, 9);
    expect(bindAssessmentIfCurrent(startedFor, current, { gate: 'ready' })).toBeNull();
  });

  it('publishes only the newest job across A → B → A', () => {
    const firstPlieJob = createAnalysisContextEpoch(context()!, 20);
    const passeJob = createAnalysisContextEpoch(context({ exerciseId: 'passe' })!, 21);
    const currentPlieJob = createAnalysisContextEpoch(context()!, 22);

    expect(bindAssessmentIfCurrent(firstPlieJob, currentPlieJob, 'stale A')).toBeNull();
    expect(bindAssessmentIfCurrent(passeJob, currentPlieJob, 'stale B')).toBeNull();
    expect(bindAssessmentIfCurrent(currentPlieJob, currentPlieJob, 'current A')?.value).toBe('current A');
  });

  it('requires a fresh assessment but can bind it to a new context using reused pose data', () => {
    const reusedPoseFrames = Object.freeze([{ timeMs: 0 }, { timeMs: 33 }]);
    const passe = createAnalysisContextEpoch(context({ exerciseId: 'passe' })!, 12);
    const freshAssessment = bindAssessmentIfCurrent(passe, passe, {
      poseFrames: reusedPoseFrames,
      exerciseId: 'passe',
    });
    expect(assessmentValueForCurrentContext(freshAssessment, passe)).toEqual({
      poseFrames: reusedPoseFrames,
      exerciseId: 'passe',
    });
    expect(freshAssessment?.value.poseFrames).toBe(reusedPoseFrames);
  });
});
