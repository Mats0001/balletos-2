import { describe, expect, it } from 'vitest';
import { buildDryadTenduCohortAsset } from '../services/dryadTenduCohort';
import { TENDU_PHASE_ORDER, type CanonicalMotionPhaseId, type DryadTenduClip } from '../types/canonicalMotion';

function trial(participantId: number, workingSide: 'left' | 'right', amplitude: number): DryadTenduClip {
  let timeUs = 0;
  const frames = TENDU_PHASE_ORDER.flatMap((phaseId: CanonicalMotionPhaseId, phaseIndex) => (
    [0, 0.5, 1].map(progress => {
      const phaseShape = phaseIndex <= 2 ? phaseIndex / 2 : (4 - phaseIndex) / 2;
      const displacement = amplitude * Math.max(0, phaseShape) * progress;
      const left = workingSide === 'left';
      const frame = {
        timeUs,
        phaseId,
        joints: {
          neck: { x: 0, y: 1.4, z: 0, confidence: 1 },
          ankleL: { x: -0.1 - (left ? displacement * 0.5 : 0), y: 0.1, z: 0, confidence: 1 },
          ankleR: { x: 0.1 + (!left ? displacement * 0.5 : 0), y: 0.1, z: 0, confidence: 1 },
          footL: { x: -0.12 - (left ? displacement : 0), y: 0.05, z: 0.1, confidence: 1 },
          footR: { x: 0.12 + (!left ? displacement : 0), y: 0.05, z: 0.1, confidence: 1 },
        },
      } as const;
      timeUs += 4_000;
      return frame;
    })
  ));
  return {
    schemaVersion: 1,
    clipId: `p${participantId}-${workingSide}`,
    exerciseId: 'tendu',
    label: 'synthetic cohort trial',
    frameRateHz: 250,
    coordinateSystem: 'balletos_metric_right_up_forward',
    provenance: {
      datasetId: 'dryad:test', sourceUrl: 'test', sourceKind: 'optical_marker',
      rightsStatus: 'product_technical_signal_allowed', licenseLabel: 'CC0-1.0',
      pedagogicalStatus: 'technical_only', nicoleReviewStatus: 'not_reviewed',
    },
    workingSide,
    participantId,
    trial: 1,
    events: [],
    frames,
  };
}

describe('Dryad Tendu cohort builder', () => {
  it('mirrors working sides and emits a non-reversible five-phase median signal', () => {
    const result = buildDryadTenduCohortAsset({
      clips: [trial(1, 'right', 0.2), trial(2, 'left', 0.3)],
      generatedFromDigest: 'a'.repeat(64),
    });

    expect(result.clip).toMatchObject({
      cohortSize: 2,
      participantCount: 2,
      sourceTrialCount: 2,
      workingSide: 'right',
      coordinateSystem: 'balletos_body_normalized_right_up_forward',
    });
    expect(result.clip.frames).toHaveLength(55);
    expect(new Set(result.clip.frames.map(frame => frame.phaseId))).toEqual(new Set(TENDU_PHASE_ORDER));
    const extended = result.clip.frames.filter(frame => frame.phaseId === 'full_extension');
    expect(extended[extended.length - 1].joints.footR!.x).toBeGreaterThan(extended[0].joints.footR!.x);
    expect(result.phaseDispersion).toHaveLength(5);
    expect(result.phaseDispersion.every(item => item.sourceSampleCount === 22)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('participantId');
  });

  it('rejects duplicate or incomplete cohort inputs', () => {
    const clip = trial(1, 'right', 0.2);
    expect(() => buildDryadTenduCohortAsset({ clips: [clip], generatedFromDigest: 'a'.repeat(64) })).toThrow();
    expect(() => buildDryadTenduCohortAsset({ clips: [clip, clip], generatedFromDigest: 'a'.repeat(64) })).toThrow(/duplicate/i);
  });
});
