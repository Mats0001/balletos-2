import { describe, expect, it } from 'vitest';
import { projectCanonicalFrameToSkeleton } from '../services/canonicalMotionAvatar';
import { buildTenduTechnicalPrototype } from '../services/tenduTechnicalPilot';
import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
  DryadTenduClip,
} from '../types/canonicalMotion';

const point = (x: number, y: number, z = 0): CanonicalJointSample => Object.freeze({ x, y, z, confidence: 1 });
const joints: Record<CanonicalJointId, CanonicalJointSample> = {
  head: point(0, 1.8), neck: point(0, 1.55), sternum: point(0, 1.35), navel: point(0, 1.1),
  pelvisCenter: point(0, 0.95), shoulderL: point(-0.2, 1.5), shoulderR: point(0.2, 1.5),
  elbowL: point(-0.4, 1.25), elbowR: point(0.4, 1.25), wristL: point(-0.55, 1.05), wristR: point(0.55, 1.05),
  pelvisL: point(-0.1, 0.95), pelvisR: point(0.1, 0.95), kneeL: point(-0.1, 0.5), kneeR: point(0.1, 0.5),
  ankleL: point(-0.1, 0.1), ankleR: point(0.1, 0.1), footL: point(-0.1, 0.05, 0.2), footR: point(0.1, 0.05, 0.2),
};

const carrier: CanonicalMotionClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'ucy-carrier',
  exerciseId: 'unclassified_full_body_motion',
  label: 'UCY Carrier',
  frameRateHz: 120,
  coordinateSystem: 'balletos_metric_right_up_forward',
  provenance: Object.freeze({
    datasetId: 'ucy:carrier', sourceUrl: 'https://dancedb.cs.ucy.ac.cy/', sourceKind: 'bvh_skeleton',
    rightsStatus: 'internal_research_only', licenseLabel: 'UCY internal', pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  frames: Object.freeze([
    Object.freeze({ timeUs: 0, joints: Object.freeze(joints) }),
    Object.freeze({ timeUs: 8_333, joints: Object.freeze({ ...joints, pelvisCenter: point(0.01, 0.95) }) }),
  ]),
});

const phases = ['departure', 'extension', 'full_extension', 'return', 'closure'] as const;
const dryad: DryadTenduClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'dryad-tendu', exerciseId: 'tendu', label: 'Dryad Tendu', frameRateHz: 250,
  coordinateSystem: 'balletos_metric_right_up_forward', workingSide: 'right', participantId: 1, trial: 1,
  provenance: Object.freeze({
    datasetId: 'dryad:tendu', sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v', sourceKind: 'optical_marker',
    rightsStatus: 'product_technical_signal_allowed', licenseLabel: 'CC0-1.0', pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  events: Object.freeze([]),
  frames: Object.freeze(phases.map((phaseId, index) => Object.freeze({
    timeUs: index * 100_000,
    phaseId,
    joints: Object.freeze({
      neck: point(0, 1.4), ankleL: point(-0.1, 0.1), ankleR: point(0.1 + index * 0.02, 0.1),
      footL: point(-0.1, 0.05, 0.2), footR: point(0.1 + index * 0.08, 0.05, 0.2),
    }),
  }))),
});

describe('Tendu technical pilot', () => {
  it('combines Dryad phases and foot path with a stable full-body line-avatar carrier', () => {
    const prototype = buildTenduTechnicalPrototype({ dryad, fullBodyCarrier: carrier });
    const skeleton = projectCanonicalFrameToSkeleton({ frame: prototype.clip.frames[2], width: 500, height: 800 });

    expect(prototype.dryadPhaseCoverage).toBe(1);
    expect(prototype.dryadFootExcursionMeters).toBeGreaterThan(0.2);
    expect(prototype.clip.frames[2].joints.head).toEqual(carrier.frames[0].joints.head);
    expect(prototype.clip.frames[2].joints.footR?.x).toBeGreaterThan(carrier.frames[0].joints.footR!.x);
    expect(prototype.productEligible).toBe(false);
    expect(prototype.clip.provenance).toMatchObject({
      rightsStatus: 'internal_research_only',
      pedagogicalStatus: 'technical_only',
      nicoleReviewStatus: 'not_reviewed',
    });
    expect(prototype.limitations.join(' ')).toMatch(/keine real|nicht für Ampel-Scoring/);
    expect(skeleton.head.vis).toBe(1);
    expect(skeleton.footR?.x).toBeGreaterThan(skeleton.footL!.x);
  });

  it('fails closed when the full-body carrier is not actually full body', () => {
    expect(() => buildTenduTechnicalPrototype({
      dryad,
      fullBodyCarrier: { ...carrier, frames: [{ timeUs: 0, joints: { head: point(0, 1.8) } }] },
    })).toThrow(/too few mapped joints/);
  });
});

