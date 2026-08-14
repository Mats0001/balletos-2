import { describe, expect, it } from 'vitest';
import {
  buildAttemptProgressCurve,
  buildStudentProgressSummaries,
  comparePhaseWithAttempt,
  createStudentAttemptSnapshot,
  findPreviousComparableAttempt,
  StudentAttemptHistoryStore,
  studentAttemptSnapshotIsValid,
} from '../services/studentAttemptHistory';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from '../services/teacherPhaseAnalysis';
import { TEACHER_REGION_KEYS, type TeacherHeuristicState } from '../types/teacherHeuristic';

function phase(
  state: TeacherHeuristicState,
  cycleIndex = 0,
  id: TeacherPhaseResult['id'] = 'full_extension',
): TeacherPhaseResult {
  const regions = Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, {
    state,
    corridorResult: state.includes('strong_attention') ? 'outside' : state.includes('attention') ? 'overlap' : 'inside',
    sampleCount: 5,
    agreement: 1,
    uncertainRatio: state.includes('uncertain') || state.includes('weak') ? 1 : 0,
  }])) as TeacherPhaseResult['regions'];
  return {
    id,
    cycleIndex,
    label: id === 'full_extension' ? 'Volle Streckung' : 'Ausgang',
    startMs: cycleIndex * 1000,
    endMs: cycleIndex * 1000 + 500,
    representativeTimeMs: cycleIndex * 1000 + 250,
    confidence: 0.9,
    motion: { durationMs: 500, workingFootPathLength: 0.24, workingFootJitter: 0.004, sampleCount: 5 },
    regions,
    displayState: state,
  };
}

function analysis(
  sourceState: TeacherHeuristicState = 'heuristic_attention',
  status: TeacherPhaseAnalysis['gate']['status'] = 'ready',
): TeacherPhaseAnalysis {
  return {
    schemaVersion: 1,
    exerciseId: 'tendu',
    exerciseLabel: 'Battement Tendu',
    levelLabel: 'MINIS',
    workingSide: 'right',
    direction: 'a_la_seconde',
    directionConfidence: 0.88,
    phaseEngineConfidence: 0.9,
    phaseAuthority: 'teacher_assessment',
    cycleCount: 1,
    gate: { status, checks: [], correctiveActions: [], detectedPerspective: 'FRONTAL' },
    phases: status === 'needs_correction' ? [] : [phase(sourceState)],
    framesAnalyzed: 120,
    policyVersion: 'test-policy',
  };
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    read: () => value,
  };
}

function keyedMemoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => { values.set(key, next); },
    read: (key: string) => values.get(key) ?? null,
  };
}

describe('student attempt history', () => {
  it('captures only a non-reference phase summary and blocks unusable recordings', () => {
    const snapshot = createStudentAttemptSnapshot({
      analysis: analysis(),
      studentLabel: 'Emma Berger',
      sourceId: '/videos/nicole_saal_6.mp4',
      now: () => new Date('2026-08-13T12:00:00.000Z'),
      createId: () => 'attempt-1',
    });
    expect(snapshot).toMatchObject({
      attemptId: 'attempt-1',
      schemaVersion: 2,
      studentId: 'student:emma-berger',
      sourceRole: 'test_recording',
      referenceAuthority: 'none',
      perspective: 'FRONTAL',
      direction: 'a_la_seconde',
    });
    expect(snapshot && studentAttemptSnapshotIsValid(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/landmarks|videoData|rawFrame/i);
    expect(createStudentAttemptSnapshot({
      analysis: analysis('heuristic_match', 'needs_correction'),
      studentLabel: 'Emma Berger',
      sourceId: 'clip.mp4',
    })).toBeNull();
    expect(createStudentAttemptSnapshot({
      analysis: analysis(),
      studentLabel: 'Nicht registriert',
      sourceId: 'clip.mp4',
    })).toBeNull();
  });

  it('persists one immutable summary per student, source, exercise and level', () => {
    const storage = memoryStorage();
    const store = new StudentAttemptHistoryStore(storage);
    const first = createStudentAttemptSnapshot({
      analysis: analysis(), studentLabel: 'Emma', sourceId: 'clip-a.mp4',
      now: () => new Date('2026-08-12T10:00:00Z'), createId: () => 'first',
    })!;
    const duplicate = createStudentAttemptSnapshot({
      analysis: analysis('heuristic_match'), studentLabel: 'Emma', sourceId: 'clip-a.mp4',
      now: () => new Date('2026-08-13T10:00:00Z'), createId: () => 'duplicate',
    })!;
    expect(store.save(first)).toEqual(first);
    expect(store.save(duplicate).attemptId).toBe('first');
    expect(store.list()).toHaveLength(1);
    expect(JSON.parse(storage.read()!).schemaVersion).toBe(2);
  });

  it('compares only the same student, exercise, level, perspective and working side', () => {
    const previous = createStudentAttemptSnapshot({
      analysis: analysis('heuristic_strong_attention'), studentLabel: 'Emma', sourceId: 'clip-a.mp4',
      now: () => new Date('2026-08-12T10:00:00Z'), createId: () => 'previous',
    })!;
    const otherStudent = createStudentAttemptSnapshot({
      analysis: analysis('heuristic_match'), studentLabel: 'Clara', sourceId: 'clip-c.mp4',
      now: () => new Date('2026-08-13T10:00:00Z'), createId: () => 'other',
    })!;
    const current = createStudentAttemptSnapshot({
      analysis: analysis('heuristic_match_uncertain'), studentLabel: 'Emma', sourceId: 'clip-b.mp4',
      now: () => new Date('2026-08-14T10:00:00Z'), createId: () => 'current',
    })!;
    expect(findPreviousComparableAttempt([otherStudent, previous], current)?.attemptId).toBe('previous');
    expect(findPreviousComparableAttempt([current], current)).toBeNull();
    expect(findPreviousComparableAttempt([{ ...previous, perspective: 'PROFILE_LEFT' }], current)).toBeNull();
    expect(findPreviousComparableAttempt([{ ...previous, direction: 'devant' }], current)).toBeNull();
    expect(findPreviousComparableAttempt([{ ...previous, policyVersion: 'other-policy' }], current)).toBeNull();
    expect(findPreviousComparableAttempt([{ ...previous, perspective: null }], { ...current, perspective: null })).toBeNull();
    expect(findPreviousComparableAttempt([{ ...previous, direction: 'undetermined' }], { ...current, direction: 'undetermined' })).toBeNull();
    const comparison = comparePhaseWithAttempt(phase('heuristic_match_uncertain'), previous);
    expect(comparison).toMatchObject({
      previousAttemptId: 'previous',
      improved: TEACHER_REGION_KEYS.length,
      unchanged: 0,
      needsMoreAttention: 0,
      provisional: true,
      motion: expect.objectContaining({ steadinessTrend: 'similar' }),
    });
    const smootherPhase = {
      ...phase('heuristic_match_uncertain'),
      motion: { durationMs: 450, workingFootPathLength: 0.27, workingFootJitter: 0.002, sampleCount: 5 },
    };
    expect(comparePhaseWithAttempt(smootherPhase, previous)?.motion).toMatchObject({
      footPathLengthDeltaPercent: 13,
      jitterDeltaPercent: -50,
      durationDeltaPercent: -10,
      steadinessTrend: 'steadier',
    });
    const curve = buildAttemptProgressCurve(current, previous);
    expect(curve).toHaveLength(1);
    expect(curve[0]).toMatchObject({ phaseId: 'full_extension', provisional: true });
    expect(curve[0].score).toBeGreaterThan(0);
    const summaries = buildStudentProgressSummaries([otherStudent, previous, current]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      studentId: 'student:emma-berger',
      attemptCount: 2,
      latestAttemptId: 'current',
      previousAttemptId: 'previous',
      phaseTrend: 'improved',
      comparablePhaseCount: 1,
      steadinessTrend: 'similar',
    });
    expect(buildStudentProgressSummaries([{ ...previous, sourceId: 'same.mp4' }, { ...current, sourceId: 'same.mp4' }])).toEqual([]);
  });

  it('fails closed on malformed storage and propagates write failures', () => {
    const malformed = new StudentAttemptHistoryStore(memoryStorage('{"schemaVersion":1,"records":[null]}'));
    expect(malformed.list()).toEqual([]);
    const failing = new StudentAttemptHistoryStore({
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    });
    const snapshot = createStudentAttemptSnapshot({
      analysis: analysis(), studentLabel: 'Emma', sourceId: 'clip-a.mp4', createId: () => 'attempt',
    })!;
    expect(() => failing.save(snapshot)).toThrow('quota');
    let writes = 0;
    const unreadable = new StudentAttemptHistoryStore({
      getItem: () => { throw new Error('read failed'); },
      setItem: () => { writes++; },
    });
    expect(unreadable.list()).toEqual([]);
    expect(() => unreadable.save(snapshot)).toThrow('nicht sicher gelesen');
    expect(writes).toBe(0);
  });

  it('migrates known V1 label identities without inventing sessions or references', () => {
    const current = createStudentAttemptSnapshot({
      analysis: analysis(), studentLabel: 'Emma Berger', sourceId: 'clip-a.mp4',
      now: () => new Date('2026-08-12T10:00:00Z'), createId: () => 'legacy',
    })!;
    const { studentId: _studentId, direction: _direction, ...legacyBody } = current;
    const legacy = { ...legacyBody, schemaVersion: 1, studentKey: 'emma-berger' };
    const storage = keyedMemoryStorage({
      balletos_student_attempt_history_v1: JSON.stringify({ schemaVersion: 1, records: [legacy] }),
    });
    const store = new StudentAttemptHistoryStore(storage);

    expect(store.list()).toEqual([expect.objectContaining({
      schemaVersion: 2,
      attemptId: 'legacy',
      studentId: 'student:emma-berger',
      direction: null,
      referenceAuthority: 'none',
    })]);
    expect(storage.read('balletos_student_attempt_history_v2')).toBeNull();
    expect(new StudentAttemptHistoryStore(keyedMemoryStorage({
      balletos_student_attempt_history_v1: JSON.stringify({
        schemaVersion: 1,
        records: [{ ...legacy, studentLabel: 'Clara Schulze' }],
      }),
    })).list()).toEqual([]);
  });

  it('rejects unknown persisted fields and deep-freezes successfully loaded records', () => {
    const snapshot = createStudentAttemptSnapshot({
      analysis: analysis(), studentLabel: 'Emma', sourceId: 'clip-a.mp4', createId: () => 'attempt',
    })!;
    const malformedVariants = [
      { ...snapshot, rawFrames: [] },
      { ...snapshot, phases: [{ ...snapshot.phases[0], videoData: 'hidden' }] },
      { ...snapshot, phases: [{ ...snapshot.phases[0], motion: { ...snapshot.phases[0].motion!, landmarks: [] } }] },
      { ...snapshot, phases: [{ ...snapshot.phases[0], regions: {
        ...snapshot.phases[0].regions,
        shoulder: { ...snapshot.phases[0].regions.shoulder, rawValue: 42 },
      } }] },
    ];
    for (const malformed of malformedVariants) {
      expect(studentAttemptSnapshotIsValid(malformed)).toBe(false);
    }
    expect(studentAttemptSnapshotIsValid({ ...snapshot, exerciseLabel: 'Grand Jeté' })).toBe(false);
    expect(studentAttemptSnapshotIsValid({
      ...snapshot,
      phases: [{ ...snapshot.phases[0], id: 'invented_phase' }],
    })).toBe(false);
    expect(studentAttemptSnapshotIsValid({
      ...snapshot,
      phases: [{ ...snapshot.phases[0], id: 'flight' }],
    })).toBe(false);
    const storage = keyedMemoryStorage({
      balletos_student_attempt_history_v2: JSON.stringify({ schemaVersion: 2, records: [snapshot] }),
    });
    const [loaded] = new StudentAttemptHistoryStore(storage).list();
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.phases)).toBe(true);
    expect(Object.isFrozen(loaded.phases[0])).toBe(true);
    expect(Object.isFrozen(loaded.phases[0].motion)).toBe(true);
    expect(Object.isFrozen(loaded.phases[0].regions)).toBe(true);
    expect(Object.isFrozen(loaded.phases[0].regions.shoulder)).toBe(true);
  });

  it('does not claim progress without at least one shared phase', () => {
    const previous = createStudentAttemptSnapshot({
      analysis: { ...analysis(), phases: [phase('heuristic_attention', 0, 'preparation')] },
      studentLabel: 'Emma', sourceId: 'clip-a.mp4',
      now: () => new Date('2026-08-12T10:00:00Z'), createId: () => 'previous',
    })!;
    const current = createStudentAttemptSnapshot({
      analysis: { ...analysis(), phases: [phase('heuristic_match', 0, 'full_extension')] },
      studentLabel: 'Emma', sourceId: 'clip-b.mp4',
      now: () => new Date('2026-08-13T10:00:00Z'), createId: () => 'current',
    })!;
    expect(buildAttemptProgressCurve(current, previous)).toEqual([]);
    expect(buildStudentProgressSummaries([previous, current])).toEqual([]);
  });

  it.each(['passe', 'jete', 'changement'] as const)('accepts a non-reference %s phase-pilot history record', (exerciseId) => {
    const snapshot = createStudentAttemptSnapshot({
      analysis: {
        ...analysis('heuristic_attention_weak_evidence'),
        exerciseId,
        exerciseLabel: exerciseId === 'passe' ? 'Passé' : exerciseId === 'jete' ? 'Jeté' : 'Changement',
        phaseAuthority: 'technical_phase_pilot',
        phases: [phase('heuristic_attention_weak_evidence', 0, 'preparation')],
      },
      studentLabel: 'Emma',
      sourceId: `student-${exerciseId}.mp4`,
      createId: () => `attempt-${exerciseId}`,
    });

    expect(snapshot && studentAttemptSnapshotIsValid(snapshot)).toBe(true);
    expect(snapshot).toMatchObject({ exerciseId, referenceAuthority: 'none' });
  });
});
