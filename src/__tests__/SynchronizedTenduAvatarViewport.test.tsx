// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SynchronizedMotionAvatarViewport, SynchronizedTenduAvatarViewport } from '../components/SynchronizedTenduAvatarViewport';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from '../services/teacherPhaseAnalysis';
import { TEACHER_REGION_KEYS } from '../types/teacherHeuristic';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';
import type { StudentAttemptSnapshot } from '../services/studentAttemptHistory';

afterEach(cleanup);

const phase: TeacherPhaseResult = {
  id: 'extension', cycleIndex: 0, label: 'Abstreichen', startMs: 100, endMs: 300, representativeTimeMs: 200,
  confidence: 0.9,
  motion: { durationMs: 200, workingFootPathLength: 0.2, workingFootJitter: 0.004, sampleCount: 5 },
  displayState: 'heuristic_attention_uncertain',
  regions: Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, {
    state: 'heuristic_attention_uncertain', corridorResult: 'overlap', sampleCount: 4, agreement: .75, uncertainRatio: .25,
  }])) as TeacherPhaseResult['regions'],
};

const analysis: TeacherPhaseAnalysis = {
  schemaVersion: 1, exerciseId: 'tendu', exerciseLabel: 'Battement Tendu', levelLabel: 'MINIS', workingSide: 'right',
  direction: 'a_la_seconde', directionConfidence: 0.88, phaseEngineConfidence: 0.9,
  phaseAuthority: 'teacher_assessment',
  cycleCount: 1,
  gate: { status: 'ready', checks: [], correctiveActions: [], detectedPerspective: 'FRONTAL' },
  phases: [phase], framesAnalyzed: 40, policyVersion: 'test',
};

const p = (x: number, y: number) => ({ x, y, vis: 1 });
const liveSkeleton: ReconstructedSkeleton = {
  head: p(320, 80), neck: p(320, 150), sternum: p(320, 220), navel: p(320, 300), pelvisCenter: p(320, 380),
  shoulderL: p(250, 170), shoulderR: p(390, 170), elbowL: p(200, 250), elbowR: p(440, 250), wristL: p(150, 330), wristR: p(490, 330),
  pelvisL: p(285, 380), pelvisR: p(355, 380), kneeL: p(285, 520), kneeR: p(355, 520), ankleL: p(285, 670), ankleR: p(355, 670), footL: p(250, 690), footR: p(410, 690),
};

describe('single-clock Tendu avatar viewport', () => {
  it('renders the technical avatar, five phases and rich pending-Nicole feedback', () => {
    render(<SynchronizedTenduAvatarViewport analysis={analysis} isPlaying={false} currentTimeMs={200} getCurrentTimeMs={() => 200} />);

    expect(screen.getByTestId('tendu-single-clock-avatar').getAttribute('data-avatar-state')).toBe('mapped');
    expect(screen.getByTestId('tendu-technical-avatar-svg')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Abstr.')).toBeTruthy();
    expect(screen.getByText('Streck')).toBeTruthy();
    expect(screen.getByText('Rückweg')).toBeTruthy();
    expect(screen.getByText('Schluss')).toBeTruthy();
    expect(screen.getByTestId('tendu-rich-feedback').textContent).toContain('Was');
    expect(screen.getByText(/nicht Nicole-geprüft/i)).toBeTruthy();
    expect(screen.getByText(/100 Versuchen/i)).toBeTruthy();
  });

  it('renders Passé from the same technical motion avatar without calling it a Nicole reference', () => {
    const passePhase: TeacherPhaseResult = { ...phase, id: 'placement', label: 'Passé-Position' };
    const passeAnalysis: TeacherPhaseAnalysis = {
      ...analysis,
      exerciseId: 'passe',
      exerciseLabel: 'Passé',
      phaseAuthority: 'technical_phase_pilot',
      phases: [passePhase],
    };
    render(<SynchronizedMotionAvatarViewport analysis={passeAnalysis} isPlaying={false} currentTimeMs={200} getCurrentTimeMs={() => 200} />);

    expect(screen.getByTestId('tendu-single-clock-avatar').getAttribute('data-motion-id')).toBe('passe');
    expect(screen.getByText(/TECHNISCHER PASSÉ-PILOT/i)).toBeTruthy();
    expect(screen.getByText(/Dryad-Kohorte aus 100 Versuchen/i)).toBeTruthy();
    expect(screen.getByText(/nicht Nicole-geprüft/i)).toBeTruthy();
    expect(screen.getByText('Anheben')).toBeTruthy();
    expect(screen.getByText('Position')).toBeTruthy();
    expect(screen.getByTestId('tendu-rich-feedback').getAttribute('data-content-id')).toContain(':passe:placement:');
  });

  it('shows recording correction instead of a guessed technical comparison', () => {
    render(<SynchronizedTenduAvatarViewport analysis={{ ...analysis, gate: { ...analysis.gate, status: 'needs_correction' } }} isPlaying={false} currentTimeMs={200} getCurrentTimeMs={() => 200} />);

    expect(screen.getByTestId('tendu-single-clock-avatar').getAttribute('data-avatar-state')).toBe('blocked');
    expect(screen.queryByTestId('tendu-technical-avatar-svg')).toBeNull();
    expect(screen.getByText(/Aufnahme korrigieren/i)).toBeTruthy();
  });

  it('overlays the live skeleton and loops the same primary-video phase clock', () => {
    const onLoopRangeChange = vi.fn();
    render(<SynchronizedTenduAvatarViewport
      analysis={analysis}
      isPlaying={false}
      currentTimeMs={200}
      getCurrentTimeMs={() => 200}
      liveSkeleton={liveSkeleton}
      videoWidth={640}
      videoHeight={720}
      onLoopRangeChange={onLoopRangeChange}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Overlay' }));
    expect(screen.getByTestId('tendu-live-overlay-skeleton')).toBeTruthy();
    expect(screen.getByTestId('tendu-reference-overlay-skeleton')).toBeTruthy();
    expect(screen.getByText(/Technik · keine Sollreferenz/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Phase loopen' }));
    expect(onLoopRangeChange).toHaveBeenCalledWith({ startMs: 100, endMs: 300, label: 'Abstreichen' });
  });

  it('shows honest before/after measurements without inventing a previous pose', () => {
    const previousAttempt = { capturedAt: '2026-08-12T10:00:00.000Z', cycleCount: 1 } as StudentAttemptSnapshot;
    render(<SynchronizedTenduAvatarViewport
      analysis={analysis}
      isPlaying={false}
      currentTimeMs={200}
      getCurrentTimeMs={() => 200}
      previousAttempt={previousAttempt}
      progressCurve={[{ phaseId: 'extension', label: 'Abstreichen', score: 0.4, provisional: false }]}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Vorher/Nachher' }));
    expect(screen.getByTestId('tendu-before-after')).toBeTruthy();
    expect(screen.getByText(/keine gespeicherte oder erfundene Vorher‑Pose/i)).toBeTruthy();
    expect(screen.getByText('besser')).toBeTruthy();
  });
});
