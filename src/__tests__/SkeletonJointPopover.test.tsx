// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SkeletonJointPopover } from '../components/SkeletonJointPopover';
import { JOINT_KNOWLEDGE } from '../services/skeletonJointKnowledge';
import {
  VaganovaFullAnalysis,
  VaganovaMeasurement,
} from '../services/vaganovaAngleCalculator';

afterEach(cleanup);

function analysis(kneeMeasurements: Partial<VaganovaFullAnalysis>): VaganovaFullAnalysis {
  return {
    knieFlexionL: null,
    knieFlexionR: null,
    valgusDriftL: null,
    valgusDriftR: null,
    turnoutL: null,
    turnoutR: null,
    spineTilt: null,
    epaulement: null,
    portDeBrasL: null,
    portDeBrasR: null,
    pelvicTilt: null,
    shoulderSymmetry: null,
    shoulderElevationL: null,
    shoulderElevationR: null,
    armLineQualityL: null,
    armLineQualityR: null,
    headTilt: null,
    plumbDeviation: null,
    ...kneeMeasurements,
  };
}

function measurable(status?: 'CORRECT' | 'WARNING' | 'ERROR'): VaganovaMeasurement {
  return {
    value: 160,
    unit: 'deg',
    confidence: 0.95,
    label: 'Testmessung',
    measurement_class: 'vaganova_relation',
    status,
  };
}

function renderJoint(landmarkIndex: number, vaganovaAnalysis: VaganovaFullAnalysis | null) {
  return render(
    <SkeletonJointPopover
      knowledge={JOINT_KNOWLEDGE[landmarkIndex]}
      jointX={300}
      jointY={300}
      videoLeft={0}
      containerHeight={700}
      onClose={() => undefined}
      vaganovaAnalysis={vaganovaAnalysis}
      landmarkIndex={landmarkIndex}
    />,
  );
}

describe('SkeletonJointPopover evidence color semantics', () => {
  it('renders unavailable knee evidence neutral, never as correct', () => {
    renderJoint(25, analysis({
      valgusDriftL: {
        measurement_class: 'not_measurable',
        confidence: 0.95,
        label: 'Projizierte Knieachse (nicht bewertet)',
        not_measurable_reason: 'Kein gültiger Referenzanker.',
      },
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
    expect(screen.getByText('Kein gültiger Referenzanker.')).toBeTruthy();
  });

  it('keeps mixed correct and statusless evidence neutral', () => {
    renderJoint(25, analysis({
      knieFlexionL: measurable('CORRECT'),
      turnoutL: measurable(),
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('shows correct only when every relevant measurement is explicitly correct', () => {
    renderJoint(13, analysis({
      armLineQualityL: measurable('CORRECT'),
      portDeBrasL: measurable('CORRECT'),
    }));

    expect(screen.getByText('✓ Richtig ausgeführt')).toBeTruthy();
  });

  it('keeps a knee neutral when one expected measurement is missing', () => {
    renderJoint(25, analysis({
      knieFlexionL: measurable('CORRECT'),
      valgusDriftL: null,
      turnoutL: measurable('CORRECT'),
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('keeps an ankle neutral when the unavailable knee-axis slot is missing', () => {
    renderJoint(27, analysis({
      knieFlexionL: measurable('CORRECT'),
      valgusDriftL: null,
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('frames an unavailable ankle observation as neutral context, not a current cause', () => {
    renderJoint(27, analysis({
      valgusDriftL: {
        measurement_class: 'not_measurable',
        confidence: 0.95,
        label: 'Projizierte Knieachse (nicht bewertet)',
        not_measurable_reason: 'Kein gültiger Referenzanker.',
      },
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.getByText('Pädagogischer Kontext')).toBeTruthy();
    expect(screen.queryByText('Warum ist das problematisch?')).toBeNull();
    expect(screen.queryByText(/Pronation = oft Ursache|Theraband Knöchel-Kräftigung/i)).toBeNull();
  });
});
