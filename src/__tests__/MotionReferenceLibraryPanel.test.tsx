// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MotionReferenceLibraryPanel } from '../components/MotionReferenceLibraryPanel';
import { MOTION_REFERENCE_LIBRARY } from '../services/motionReferenceLibrary';
import type { StudentAttemptSnapshot } from '../services/studentAttemptHistory';
import { TEACHER_REGION_KEYS, type TeacherHeuristicBaseState } from '../types/teacherHeuristic';
import type { NicoleReferenceLineRecord } from '../types/nicoleReferenceLine';

afterEach(cleanup);

const nicoleRecord: NicoleReferenceLineRecord = {
  schemaVersion: 1,
  recordId: 'reference-1',
  videoSourceId: '/teacher/nicole-correct-tendu.mp4',
  targetId: 'bone.torso_side_l',
  targetKind: 'bone',
  currentVersionId: 'version-1',
  digestAlgorithm: 'sha256-canonical-json-v1',
  recordDigest: 'a'.repeat(64),
  versions: [{
    schemaVersion: 1,
    versionId: 'version-1',
    versionNumber: 1,
    teacherId: 'nicole',
    createdAt: '2026-08-13T10:00:00.000Z',
    sourceMediaTimeUs: 2_500_000,
    videoWidth: 1920,
    videoHeight: 1080,
    direction: { x: 0, y: -1 },
    sourceSegmentLengthPx: 210,
    label: 'Nicole-Referenzlinie',
    phaseBinding: {
      schemaVersion: 1,
      exerciseId: 'tendu',
      phaseId: 'full_extension',
      perspectivePlane: 'frontal',
      levelLabel: 'MINIS',
      policyVersion: 'test-policy',
      reviewState: 'nicole_approved',
      sourcePhaseStartMs: 2300,
      sourcePhaseEndMs: 2700,
      sourcePhaseRepresentativeTimeMs: 2500,
    },
    digestAlgorithm: 'sha256-canonical-json-v1',
    versionDigest: 'b'.repeat(64),
  }],
};

function attempt(attemptId: string, sourceId: string, capturedAt: string, state: TeacherHeuristicBaseState, jitter: number): StudentAttemptSnapshot {
  return {
    schemaVersion: 2,
    attemptId,
    studentId: 'student:emma-berger',
    studentLabel: 'Emma Berger',
    sourceId,
    sourceRole: 'student_attempt',
    referenceAuthority: 'none',
    capturedAt,
    exerciseId: 'tendu',
    exerciseLabel: 'Battement Tendu',
    levelLabel: 'MINIS',
    perspective: 'FRONTAL',
    workingSide: 'right',
    direction: 'a_la_seconde',
    gateStatus: 'ready',
    cycleCount: 1,
    policyVersion: 'test-policy',
    phases: [{
      id: 'full_extension',
      cycleIndex: 0,
      label: 'Volle Streckung',
      phaseConfidence: 0.9,
      motion: { durationMs: 500, workingFootPathLength: 0.25, workingFootJitter: jitter, sampleCount: 5 },
      regions: Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, { state, evidenceStrength: 'stable' }])) as StudentAttemptSnapshot['phases'][number]['regions'],
    }],
  };
}

describe('cross-video reference library', () => {
  it('keeps Nicole references, technical sources and student attempts visibly separate', () => {
    render(<MotionReferenceLibraryPanel
      open
      onClose={() => undefined}
      currentExerciseId="tendu"
      currentVideoSourceId="/videos/student-tendu.mp4"
      nicoleRecords={[nicoleRecord]}
      technicalSources={MOTION_REFERENCE_LIBRARY}
      attempts={[]}
    />);

    expect(screen.getByRole('dialog', { name: 'Cross-Video-Referenzbibliothek' })).toBeTruthy();
    expect(screen.getByText(/Nicole geprüft · V1/i)).toBeTruthy();
    expect(screen.getByText('Volle Streckung')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Technische Quellen/i }));
    expect(screen.getByText('Dryad · Tendu timing & foot path')).toBeTruthy();
    expect(screen.getAllByText('Technik · keine Sollreferenz').length).toBeGreaterThan(0);
    expect(screen.getByText(/Ein kontrollierter Rechner · keine Cloud/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Schülerverlauf/i }));
    expect(screen.getByText(/niemals als Sollreferenz/i)).toBeTruthy();
  });

  it('shows a context-matched latest-vs-previous progress summary without a grade', () => {
    render(<MotionReferenceLibraryPanel
      open
      onClose={() => undefined}
      currentExerciseId="tendu"
      currentVideoSourceId="/videos/student-tendu-b.mp4"
      nicoleRecords={[]}
      technicalSources={MOTION_REFERENCE_LIBRARY}
      attempts={[
        attempt('before', '/videos/student-tendu-a.mp4', '2026-08-12T10:00:00.000Z', 'heuristic_strong_attention', 0.008),
        attempt('today', '/videos/student-tendu-b.mp4', '2026-08-13T10:00:00.000Z', 'heuristic_match', 0.004),
      ]}
    />);

    fireEvent.click(screen.getByRole('button', { name: /Schülerverlauf/i }));
    expect(screen.getByRole('region', { name: 'Fortschrittszusammenfassungen' })).toBeTruthy();
    expect(screen.getByText('Heute stabiler')).toBeTruthy();
    expect(screen.getByText('Fußbahn ruhiger')).toBeTruthy();
    expect(screen.getByText(/keine Sollreferenz und keine Prozentnote/i)).toBeTruthy();
  });
});
