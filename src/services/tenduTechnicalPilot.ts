import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  type CanonicalJointId,
  type CanonicalJointSample,
  type CanonicalMotionClip,
  type CanonicalMotionFrame,
  type DryadTenduClip,
  type SpatialStabilityReport,
  type TenduTechnicalPrototype,
} from '../types/canonicalMotion';

const REQUIRED_JOINTS: readonly CanonicalJointId[] = Object.freeze([
  'head', 'neck', 'sternum', 'navel', 'pelvisCenter',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
  'pelvisL', 'pelvisR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'footL', 'footR',
]);

const SEGMENTS: readonly (readonly [CanonicalJointId, CanonicalJointId])[] = Object.freeze([
  ['head', 'neck'], ['neck', 'sternum'], ['sternum', 'navel'], ['navel', 'pelvisCenter'],
  ['shoulderL', 'shoulderR'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['pelvisL', 'pelvisR'],
  ['pelvisL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'footL'],
  ['pelvisR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'footR'],
]);

function distance(a: CanonicalJointSample, b: CanonicalJointSample): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!Number.isFinite(mean) || mean <= 1e-9) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function analyzeCanonicalSpatialStability(clip: CanonicalMotionClip): SpatialStabilityReport {
  if (clip.frames.length === 0) {
    return Object.freeze({ sampledFrames: 0, mappedJointRatio: 0, medianSegmentLengthCv: Infinity, stable: false });
  }
  const mappedJointRatio = clip.frames.reduce((sum, frame) => (
    sum + REQUIRED_JOINTS.filter(id => frame.joints[id]).length / REQUIRED_JOINTS.length
  ), 0) / clip.frames.length;
  const segmentCvs = SEGMENTS.flatMap(([fromId, toId]) => {
    const lengths = clip.frames.flatMap(frame => {
      const from = frame.joints[fromId];
      const to = frame.joints[toId];
      return from && to ? [distance(from, to)] : [];
    });
    const cv = coefficientOfVariation(lengths);
    return cv === null ? [] : [cv];
  });
  const medianSegmentLengthCv = median(segmentCvs);
  return Object.freeze({
    sampledFrames: clip.frames.length,
    mappedJointRatio,
    medianSegmentLengthCv,
    stable: mappedJointRatio >= 0.85 && medianSegmentLengthCv <= 0.02,
  });
}

function chooseCarrierFrame(clip: CanonicalMotionClip): CanonicalMotionFrame {
  const ranked = clip.frames
    .map(frame => ({ frame, count: REQUIRED_JOINTS.filter(id => frame.joints[id]).length }))
    .sort((left, right) => right.count - left.count || left.frame.timeUs - right.frame.timeUs);
  if (!ranked[0] || ranked[0].count < 15) throw new Error('Full-body carrier has too few mapped joints.');
  return ranked[0].frame;
}

function bodyHeight(frame: CanonicalMotionFrame): number {
  const head = frame.joints.head ?? frame.joints.neck;
  const ankleL = frame.joints.ankleL;
  const ankleR = frame.joints.ankleR;
  if (!head || !ankleL || !ankleR) throw new Error('Motion frame is missing body-height anchors.');
  const ankleY = (ankleL.y + ankleR.y) / 2;
  const height = head.y - ankleY;
  if (!Number.isFinite(height) || height <= 0.2) throw new Error('Motion frame has invalid body height.');
  return height;
}

function translated(
  base: CanonicalJointSample,
  current: CanonicalJointSample,
  origin: CanonicalJointSample,
  scale: number,
): CanonicalJointSample {
  return Object.freeze({
    x: base.x + (current.x - origin.x) * scale,
    y: base.y + (current.y - origin.y) * scale,
    z: base.z + (current.z - origin.z) * scale,
    confidence: Math.min(base.confidence, current.confidence),
  });
}

/**
 * Builds a technical hybrid: Dryad supplies exact Tendu timing/foot motion;
 * a single full-body mocap frame supplies a spatially stable carrier. The
 * result is explicitly not a pedagogical reference or correctness target.
 */
export function buildTenduTechnicalPrototype(input: {
  dryad: DryadTenduClip;
  fullBodyCarrier: CanonicalMotionClip;
}): TenduTechnicalPrototype {
  const carrier = chooseCarrierFrame(input.fullBodyCarrier);
  const firstDryad = input.dryad.frames[0];
  const workingAnkleId = input.dryad.workingSide === 'left' ? 'ankleL' : 'ankleR';
  const workingFootId = input.dryad.workingSide === 'left' ? 'footL' : 'footR';
  const baseAnkle = carrier.joints[workingAnkleId];
  const baseFoot = carrier.joints[workingFootId];
  const originAnkle = firstDryad.joints[workingAnkleId];
  const originFoot = firstDryad.joints[workingFootId];
  if (!baseAnkle || !baseFoot || !originAnkle || !originFoot) {
    throw new Error('Tendu technical pilot is missing working-foot anchors.');
  }
  const scale = bodyHeight(carrier) / bodyHeight(firstDryad);
  if (!Number.isFinite(scale) || scale < 0.05 || scale > 20) {
    throw new Error('Tendu technical pilot has incompatible body scale.');
  }

  const frames = input.dryad.frames.map(frame => {
    const currentAnkle = frame.joints[workingAnkleId];
    const currentFoot = frame.joints[workingFootId];
    if (!currentAnkle || !currentFoot) throw new Error('Dryad frame is missing working-foot evidence.');
    return Object.freeze({
      timeUs: frame.timeUs,
      phaseId: frame.phaseId,
      joints: Object.freeze({
        ...carrier.joints,
        [workingAnkleId]: translated(baseAnkle, currentAnkle, originAnkle, scale),
        [workingFootId]: translated(baseFoot, currentFoot, originFoot, scale),
      }),
    });
  });
  const carrierStability = analyzeCanonicalSpatialStability(input.fullBodyCarrier);
  const phaseCoverage = new Set(frames.map(frame => frame.phaseId).filter(Boolean)).size / 5;
  const footOrigin = frames[0].joints[workingFootId]!;
  const footExcursion = Math.max(...frames.map(frame => distance(footOrigin, frame.joints[workingFootId]!)));

  return Object.freeze({
    clip: Object.freeze({
      schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
      clipId: `technical-tendu:${input.dryad.clipId}:${input.fullBodyCarrier.clipId}`,
      exerciseId: 'tendu_technical_hybrid',
      label: `Technischer Tendu-Pilot · ${input.dryad.label}`,
      frameRateHz: input.dryad.frameRateHz,
      coordinateSystem: input.fullBodyCarrier.coordinateSystem,
      provenance: Object.freeze({
        datasetId: `composite:${input.dryad.provenance.datasetId}+${input.fullBodyCarrier.provenance.datasetId}`,
        sourceUrl: input.dryad.provenance.sourceUrl,
        sourceKind: 'composite_technical',
        rightsStatus: 'internal_research_only',
        licenseLabel: `${input.dryad.provenance.licenseLabel} + ${input.fullBodyCarrier.provenance.licenseLabel}`,
        pedagogicalStatus: 'technical_only',
        nicoleReviewStatus: 'not_reviewed',
      }),
      frames: Object.freeze(frames),
    }),
    workingSide: input.dryad.workingSide,
    dryadPhaseCoverage: phaseCoverage,
    dryadFootExcursionMeters: footExcursion,
    fullBodyStability: carrierStability,
    productEligible: false,
    limitations: Object.freeze([
      'Technischer Hybrid, keine real aufgenommene Tendu-Ganzkörperbewegung.',
      'Der Ganzkörperträger ist weder Vaganova-Norm noch Nicole-Referenz.',
      'Nur für Import, Retargeting, Phasen- und Darstellungsregression; nicht für Ampel-Scoring.',
    ]),
  });
}
