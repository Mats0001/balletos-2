import type {
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
} from '../types/canonicalMotion';

const sample = (x: number, y: number, z = 0): CanonicalJointSample => Object.freeze({
  x, y, z, confidence: 1,
});

/**
 * Product-owned neutral drawing carrier. It provides topology and stable body
 * proportions only; it is neither a ballet ideal nor a Nicole reference.
 */
export const NEUTRAL_LINE_AVATAR_JOINTS: Readonly<Record<CanonicalJointId, CanonicalJointSample>> = Object.freeze({
  head: sample(0, 1.8), neck: sample(0, 1.56), sternum: sample(0, 1.42), navel: sample(0, 1.18), pelvisCenter: sample(0, .98),
  shoulderL: sample(-.21, 1.52), shoulderR: sample(.21, 1.52), elbowL: sample(-.52, 1.48), elbowR: sample(.52, 1.48),
  wristL: sample(-.78, 1.45), wristR: sample(.78, 1.45), pelvisL: sample(-.12, .98), pelvisR: sample(.12, .98),
  kneeL: sample(-.13, .52), kneeR: sample(.13, .52), ankleL: sample(-.14, .08), ankleR: sample(.14, .08),
  footL: sample(-.20, .04, .12), footR: sample(.20, .04, .12),
});

export const NEUTRAL_LINE_AVATAR_CLIP: CanonicalMotionClip = Object.freeze({
  schemaVersion: 1,
  clipId: 'balletos-neutral-line-carrier-v1',
  exerciseId: 'neutral_line_avatar_carrier',
  label: 'BalletOS neutraler Linienkörper',
  frameRateHz: 60,
  coordinateSystem: 'balletos_metric_right_up_forward',
  provenance: Object.freeze({
    datasetId: 'balletos:neutral-line-carrier:v1',
    sourceUrl: 'internal://balletos/neutral-line-carrier',
    sourceKind: 'authored_animation',
    rightsStatus: 'product_technical_signal_allowed',
    licenseLabel: 'BalletOS-eigener neutraler Linienkörper',
    pedagogicalStatus: 'technical_only',
    nicoleReviewStatus: 'not_reviewed',
  }),
  frames: Object.freeze([
    Object.freeze({ timeUs: 0, joints: NEUTRAL_LINE_AVATAR_JOINTS }),
    Object.freeze({ timeUs: 8_333, joints: NEUTRAL_LINE_AVATAR_JOINTS }),
  ]),
});
