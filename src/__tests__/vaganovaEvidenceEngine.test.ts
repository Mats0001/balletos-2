import { describe, expect, it } from 'vitest';
import schema from '../services/vaganova-metrics.schema.json';
import { PoseLandmark } from '../services/realMediaPipePose';
import { VaganovaEvidenceEngineService } from '../services/vaganovaEvidenceEngine';
import { RegionEvidence } from '../types';

function landmarks(): PoseLandmark[] {
  const points = Array.from({ length: 33 }, (_, index) => ({
    x: 0.2 + (index % 6) * 0.1,
    y: 0.15 + Math.floor(index / 6) * 0.12,
    z: 0,
    visibility: 0.95,
  }));
  points[23] = { x: 0.42, y: 0.55, z: 0, visibility: 0.95 };
  points[25] = { x: 0.47, y: 0.72, z: 0, visibility: 0.95 };
  points[27] = { x: 0.4, y: 0.9, z: 0, visibility: 0.95 };
  points[31] = { x: 0.34, y: 0.92, z: 0, visibility: 0.95 };
  return points;
}

describe('VaganovaEvidenceEngine knee-axis contract', () => {
  it('keeps visible knee landmarks blocked without an authorized reference contract', () => {
    const engine = new VaganovaEvidenceEngineService();
    const ledger = engine.computeRegionEvidence(landmarks(), 'demi_plie');
    const knee = ledger.find(item => item.region === 'kneeLeft');

    expect(knee?.presentLandmarks.length).toBeGreaterThanOrEqual(3);
    expect(knee?.verdict).toBe('blocked');
    expect(knee?.reason).toMatch(/Referenzanker.*gesperrt/i);
  });

  it('emits a neutral checkpoint without number, target, praise, or baseline claim', () => {
    const engine = new VaganovaEvidenceEngineService();
    const feedback = engine.buildFeedbackObject(
      'Test',
      'demi_plie',
      '00:03.000',
      landmarks(),
      'left_knee',
      false,
      960,
      1280,
    );
    const knee = feedback.checkpointResults.find(item => item.checkpointId === 'left_knee');
    const visibleKneeOutput = JSON.stringify({
      knee,
      findingHeadline: feedback.findingHeadline,
      whyRelevant: feedback.whyRelevant,
      positiveNote: feedback.positiveNote,
      historyComparison: feedback.historyComparison,
      nextCue: feedback.nextCue,
    });

    expect(knee).toMatchObject({
      status: 'nicht_auswertbar',
      measuredValue: 'Nicht messbar',
      targetValue: 'Keine bewertbare Schwelle',
    });
    expect(feedback.positiveNote).toBe('Keine automatische Stärke freigegeben – Nicole beurteilt den Frame.');
    expect(feedback.historyComparison).toBe('Kein belastbarer Vergleich ohne bestätigte Session-Referenz.');
    expect(visibleKneeOutput).not.toMatch(/\d+[.,]?\d*°|0.?5|valgus|baseline|verletzung|muskel|ursache/i);
  });

  it.each(['review', 'hint', 'blocked'] as const)(
    'does not expose a measurement when region evidence is %s',
    verdict => {
      const engine = new VaganovaEvidenceEngineService();
      const headEvidence: RegionEvidence = {
        region: 'head',
        requiredLandmarks: [0],
        presentLandmarks: [0],
        allowedSources: ['pose'],
        confidence: 95,
        stability: -1,
        verdict,
        reason: 'Test evidence',
      };
      const checkpoint = engine.computeCheckpoints(
        [headEvidence],
        'head_epaulement',
        landmarks(),
        960,
        1280,
      ).find(item => item.checkpointId === 'head_epaulement');

      expect(checkpoint).toMatchObject({
        status: 'nicht_auswertbar',
        measuredValue: 'Nicht messbar',
        targetValue: 'Keine bewertbare Schwelle',
      });
    },
  );

  it('keeps every checkpoint neutral when the evidence ledger is missing', () => {
    const engine = new VaganovaEvidenceEngineService();
    const checkpoints = engine.computeCheckpoints([], 'head_epaulement', landmarks(), 960, 1280);

    expect(checkpoints.every(item => (
      item.status === 'nicht_auswertbar'
      && item.measuredValue === 'Nicht messbar'
      && item.targetValue === 'Keine bewertbare Schwelle'
    ))).toBe(true);
  });

  it('keeps left and right knee feedback side-specific and neutral', () => {
    const engine = new VaganovaEvidenceEngineService();
    const left = engine.buildFeedbackObject('Test', 'demi_plie', '00:03.000', landmarks(), 'left_knee', false, 960, 1280);
    const right = engine.buildFeedbackObject('Test', 'demi_plie', '00:03.000', landmarks(), 'right_knee', false, 960, 1280);

    expect(left.findingHeadline).toBe('Linke Knieachse (2D-Beobachtung): Nicht messbar');
    expect(right.findingHeadline).toBe('Rechte Knieachse (2D-Beobachtung): Nicht messbar');
    expect(right.checkpointResults.find(item => item.checkpointId === 'right_knee')).toMatchObject({
      region: 'kneeRight',
      status: 'nicht_auswertbar',
      measuredValue: 'Nicht messbar',
    });
  });

  it('keeps schema and runtime aligned on an unscored unavailable knee axis', () => {
    const kneeMetric = schema.metrics.find(metric => metric.metric_id === 'projected_knee_axis_unscored');

    expect(kneeMetric).toMatchObject({
      measurement_class: 'not_measurable',
      target_type: 'none',
      validation_status: 'not_system_validated',
    });
    expect(kneeMetric).not.toHaveProperty('target');
    expect(JSON.stringify(schema)).not.toMatch(/knee_drift_relative|session_baseline_frame_0_to_30|relative_only_valid|individual_baseline/);
    const flexionMetric = schema.metrics.find(metric => metric.metric_id === 'projected_knee_flexion_plie');
    expect(flexionMetric?.source?.doi).toBe('10.3390/sports12020054');
  });
});
