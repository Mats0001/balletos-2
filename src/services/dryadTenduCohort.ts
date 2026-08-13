import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  TENDU_PHASE_ORDER,
  type CanonicalJointSample,
  type CanonicalMotionFrame,
  type CanonicalMotionPhaseId,
  type DryadTenduClip,
  type DryadTenduCohortAsset,
  type DryadTenduCohortClip,
  type DryadTenduPhaseDispersion,
} from '../types/canonicalMotion';

interface NormalizedSample {
  ankle: Readonly<{ x: number; y: number; z: number }>;
  foot: Readonly<{ x: number; y: number; z: number }>;
  radialSpread: number;
}

const DEFAULT_SAMPLES_PER_PHASE = 11;

function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new Error('Dryad cohort quantile has no values.');
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

function point(x: number, y: number, z: number, confidence = 0.95): CanonicalJointSample {
  if (![x, y, z, confidence].every(Number.isFinite)) throw new Error('Dryad cohort contains invalid geometry.');
  return Object.freeze({ x, y, z, confidence });
}

function sourcePhaseFrames(clip: DryadTenduClip, phaseId: CanonicalMotionPhaseId): readonly CanonicalMotionFrame[] {
  return clip.frames.filter(frame => frame.phaseId === phaseId);
}

function samplePhaseFrame(
  clip: DryadTenduClip,
  phaseId: CanonicalMotionPhaseId,
  progress: number,
): CanonicalMotionFrame {
  const frames = sourcePhaseFrames(clip, phaseId);
  if (frames.length < 2) throw new Error(`Dryad cohort trial ${clip.clipId} is missing ${phaseId}.`);
  return frames[Math.round(progress * (frames.length - 1))];
}

function normalizedWorkingFoot(
  clip: DryadTenduClip,
  frame: CanonicalMotionFrame,
  origin: CanonicalMotionFrame,
): NormalizedSample {
  const ankleId = clip.workingSide === 'left' ? 'ankleL' : 'ankleR';
  const footId = clip.workingSide === 'left' ? 'footL' : 'footR';
  const ankle = frame.joints[ankleId];
  const foot = frame.joints[footId];
  const originAnkle = origin.joints[ankleId];
  const originFoot = origin.joints[footId];
  const neck = origin.joints.neck;
  const standingAnkle = origin.joints[clip.workingSide === 'left' ? 'ankleR' : 'ankleL'] ?? originAnkle;
  if (!ankle || !foot || !originAnkle || !originFoot || !neck || !standingAnkle) {
    throw new Error(`Dryad cohort trial ${clip.clipId} is missing working-foot anchors.`);
  }
  const bodyHeight = neck.y - standingAnkle.y;
  if (!Number.isFinite(bodyHeight) || bodyHeight <= 0.4) {
    throw new Error(`Dryad cohort trial ${clip.clipId} has invalid body-height normalization.`);
  }
  const mirror = clip.workingSide === 'left' ? -1 : 1;
  const normalize = (current: CanonicalJointSample, start: CanonicalJointSample) => Object.freeze({
    x: mirror * (current.x - start.x) / bodyHeight,
    y: (current.y - start.y) / bodyHeight,
    z: (current.z - start.z) / bodyHeight,
  });
  const normalizedAnkle = normalize(ankle, originAnkle);
  const normalizedFoot = normalize(foot, originFoot);
  return {
    ankle: normalizedAnkle,
    foot: normalizedFoot,
    radialSpread: Math.hypot(normalizedFoot.x, normalizedFoot.y, normalizedFoot.z),
  };
}

function phaseDurationUs(clip: DryadTenduClip, phaseId: CanonicalMotionPhaseId): number {
  const frames = sourcePhaseFrames(clip, phaseId);
  if (frames.length < 2) return 0;
  return Math.max(1, frames[frames.length - 1].timeUs - frames[0].timeUs);
}

/**
 * Builds a non-reversible technical cohort signal. Each generated point is a
 * phase-normalized median across trials; no participant trajectory is shipped.
 * It is suitable for timing/retargeting regression, never as a correctness norm.
 */
export function buildDryadTenduCohortAsset(input: {
  clips: readonly DryadTenduClip[];
  generatedFromDigest: string;
  samplesPerPhase?: number;
}): DryadTenduCohortAsset {
  const samplesPerPhase = Math.floor(input.samplesPerPhase ?? DEFAULT_SAMPLES_PER_PHASE);
  if (input.clips.length < 2 || samplesPerPhase < 3 || !/^[a-f0-9]{64}$/i.test(input.generatedFromDigest)) {
    throw new Error('Dryad cohort input is incomplete.');
  }
  const uniqueIds = new Set(input.clips.map(clip => clip.clipId));
  if (uniqueIds.size !== input.clips.length) throw new Error('Dryad cohort contains duplicate trials.');
  const participants = new Set(input.clips.map(clip => clip.participantId));
  const origins = new Map(input.clips.map(clip => [clip.clipId, clip.frames[0]]));
  if ([...origins.values()].some(frame => !frame)) throw new Error('Dryad cohort contains an empty trial.');

  let timeCursorUs = 0;
  const frames: CanonicalMotionFrame[] = [];
  const phaseDispersion: DryadTenduPhaseDispersion[] = [];
  for (const phaseId of TENDU_PHASE_ORDER) {
    const durationUs = Math.max(1, Math.round(median(input.clips.map(clip => phaseDurationUs(clip, phaseId)))));
    const phaseRadialValues: number[] = [];
    for (let sampleIndex = 0; sampleIndex < samplesPerPhase; sampleIndex++) {
      const progress = sampleIndex / (samplesPerPhase - 1);
      const samples = input.clips.map(clip => normalizedWorkingFoot(
        clip,
        samplePhaseFrame(clip, phaseId, progress),
        origins.get(clip.clipId)!,
      ));
      const ankle = {
        x: median(samples.map(sample => sample.ankle.x)),
        y: median(samples.map(sample => sample.ankle.y)),
        z: median(samples.map(sample => sample.ankle.z)),
      };
      const foot = {
        x: median(samples.map(sample => sample.foot.x)),
        y: median(samples.map(sample => sample.foot.y)),
        z: median(samples.map(sample => sample.foot.z)),
      };
      const deviations = samples.map(sample => Math.hypot(
        sample.foot.x - foot.x,
        sample.foot.y - foot.y,
        sample.foot.z - foot.z,
      ));
      phaseRadialValues.push(...deviations);
      frames.push(Object.freeze({
        timeUs: timeCursorUs + Math.round(progress * durationUs),
        phaseId,
        joints: Object.freeze({
          neck: point(0, 1, 0),
          ankleL: point(-0.1, 0.04, 0),
          footL: point(-0.14, 0, 0.08),
          ankleR: point(0.1 + ankle.x, 0.04 + ankle.y, ankle.z),
          footR: point(0.14 + foot.x, foot.y, 0.08 + foot.z),
        }),
      }));
    }
    phaseDispersion.push(Object.freeze({
      phaseId,
      medianRadialSpread: median(phaseRadialValues),
      p90RadialSpread: quantile(phaseRadialValues, 0.9),
      sourceSampleCount: phaseRadialValues.length,
    }));
    timeCursorUs += durationUs + 1;
  }

  const clip: DryadTenduCohortClip = Object.freeze({
    schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
    clipId: `dryad-tendu-cohort-${input.clips.length}`,
    exerciseId: 'tendu',
    label: `Dryad Tendu · Kohorte ${input.clips.length} Versuche`,
    frameRateHz: 250,
    coordinateSystem: 'balletos_body_normalized_right_up_forward',
    workingSide: 'right',
    cohortSize: input.clips.length,
    participantCount: participants.size,
    sourceTrialCount: input.clips.length,
    provenance: Object.freeze({
      datasetId: 'dryad:10.5061/dryad.dncjsxm8v:2025-01-02:cohort-aggregate',
      sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
      sourceKind: 'optical_marker',
      rightsStatus: 'product_technical_signal_allowed',
      licenseLabel: 'CC0-1.0 · nicht-reversible Kohortenverdichtung',
      pedagogicalStatus: 'technical_only',
      nicoleReviewStatus: 'not_reviewed',
      sourceDigest: input.generatedFromDigest,
    }),
    frames: Object.freeze(frames),
  });
  return Object.freeze({
    schemaVersion: 1,
    generatedFromDigest: input.generatedFromDigest,
    clip,
    phaseDispersion: Object.freeze(phaseDispersion),
  });
}
