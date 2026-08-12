// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VaganovaLiveMetrics } from '../components/VaganovaLiveMetrics';
import { VaganovaFullAnalysis } from '../services/vaganovaAngleCalculator';

afterEach(cleanup);

function unavailableAnalysis(): VaganovaFullAnalysis {
  const unavailable = (side: string) => ({
    measurement_class: 'not_measurable' as const,
    confidence: 0.95,
    label: `Projizierte Knieachsengeometrie ${side} (nicht bewertet)`,
    not_measurable_reason: 'Kein gültiger Referenzanker.',
  });
  return {
    knieFlexionL: null,
    knieFlexionR: null,
    valgusDriftL: unavailable('links'),
    valgusDriftR: unavailable('rechts'),
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
  };
}

describe('VaganovaLiveMetrics unavailable knee axis', () => {
  it('shows neutral rows without BAS, delta, or a numeric value', () => {
    render(
      <VaganovaLiveMetrics
        vaganovaAnalysis={unavailableAnalysis()}
        isPlie
        effectiveAgeGroup="KIDS"
      />,
    );

    expect(screen.getByText('Knieachse links')).toBeTruthy();
    expect(screen.getByText('Knieachse rechts')).toBeTruthy();
    expect(screen.getAllByText('nicht messbar')).toHaveLength(2);
    expect(screen.getByText(/Referenzframe, Perspektive, Spiegelung und Bewegungsphase/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/BAS|°Δ|Knie-Drift|Valgus/);
  });
});
