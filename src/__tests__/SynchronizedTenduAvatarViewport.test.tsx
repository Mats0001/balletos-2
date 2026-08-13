// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SynchronizedTenduAvatarViewport } from '../components/SynchronizedTenduAvatarViewport';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from '../services/teacherPhaseAnalysis';
import { TEACHER_REGION_KEYS } from '../types/teacherHeuristic';

afterEach(cleanup);

const phase: TeacherPhaseResult = {
  id: 'extension', cycleIndex: 0, label: 'Abstreichen', startMs: 100, endMs: 300, representativeTimeMs: 200,
  confidence: 0.9,
  displayState: 'heuristic_attention_uncertain',
  regions: Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, {
    state: 'heuristic_attention_uncertain', corridorResult: 'overlap', sampleCount: 4, agreement: .75, uncertainRatio: .25,
  }])) as TeacherPhaseResult['regions'],
};

const analysis: TeacherPhaseAnalysis = {
  schemaVersion: 1, exerciseId: 'tendu', exerciseLabel: 'Battement Tendu', levelLabel: 'MINIS', workingSide: 'right',
  direction: 'a_la_seconde', directionConfidence: 0.88, phaseEngineConfidence: 0.9,
  cycleCount: 1,
  gate: { status: 'ready', checks: [], correctiveActions: [], detectedPerspective: 'FRONTAL' },
  phases: [phase], framesAnalyzed: 40, policyVersion: 'test',
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

  it('shows recording correction instead of a guessed technical comparison', () => {
    render(<SynchronizedTenduAvatarViewport analysis={{ ...analysis, gate: { ...analysis.gate, status: 'needs_correction' } }} isPlaying={false} currentTimeMs={200} getCurrentTimeMs={() => 200} />);

    expect(screen.getByTestId('tendu-single-clock-avatar').getAttribute('data-avatar-state')).toBe('blocked');
    expect(screen.queryByTestId('tendu-technical-avatar-svg')).toBeNull();
    expect(screen.getByText(/Aufnahme korrigieren/i)).toBeTruthy();
  });
});
