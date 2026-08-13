import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  type CanonicalJointId,
  type CanonicalJointSample,
} from '../types/canonicalMotion';
import type {
  DryadMotionTrial,
  DryadTechnicalCohortAsset,
  DryadTechnicalCohortFrame,
  DryadTechnicalEventTiming,
} from '../types/motionRegistry';
import { DRYAD_MOVEMENT_SPECS } from './dryadMotionImporter';

const DEFAULT_FRAME_COUNT = 61;
const JOINT_IDS = ['neck', 'ankleL', 'ankleR', 'footL', 'footR'] as const satisfies readonly CanonicalJointId[];

function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new Error('Dryad cohort has no values.');
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

const median = (values: readonly number[]) => quantile(values, 0.5);

function point(x: number, y: number, z: number): CanonicalJointSample {
  if (![x, y, z].every(Number.isFinite)) throw new Error('Dryad cohort contains invalid geometry.');
  return Object.freeze({ x, y, z, confidence: 0.95 });
}

interface NormalizedTrial {
  trial: DryadMotionTrial;
  frames: readonly Readonly<Record<(typeof JOINT_IDS)[number], CanonicalJointSample>>[];
}

function normalizeTrial(trial: DryadMotionTrial): NormalizedTrial {
  const origin = trial.frames[0];
  const neck = origin.joints.neck;
  const ankleL = origin.joints.ankleL;
  const ankleR = origin.joints.ankleR;
  if (!neck || !ankleL || !ankleR) throw new Error(`Dryad ${trial.clipId} lacks normalization anchors.`);
  const center = {
    x: (ankleL.x + ankleR.x) / 2,
    y: (ankleL.y + ankleR.y) / 2,
    z: (ankleL.z + ankleR.z) / 2,
  };
  const height = neck.y - center.y;
  if (!Number.isFinite(height) || height <= 0.4) throw new Error(`Dryad ${trial.clipId} has invalid body height.`);
  const mirror = trial.workingSide === 'left' ? -1 : 1;
  const sourceId = (target: (typeof JOINT_IDS)[number]): (typeof JOINT_IDS)[number] => {
    if (trial.workingSide !== 'left') return target;
    if (target.endsWith('L')) return `${target.slice(0, -1)}R` as (typeof JOINT_IDS)[number];
    if (target.endsWith('R')) return `${target.slice(0, -1)}L` as (typeof JOINT_IDS)[number];
    return target;
  };
  const frames = trial.frames.map(frame => Object.freeze(Object.fromEntries(JOINT_IDS.map(target => {
    const source = frame.joints[sourceId(target)];
    if (!source) throw new Error(`Dryad ${trial.clipId} lacks ${target}.`);
    return [target, point(
      mirror * (source.x - center.x) / height,
      (source.y - center.y) / height,
      (source.z - center.z) / height,
    )];
  })) as Record<(typeof JOINT_IDS)[number], CanonicalJointSample>));
  return { trial, frames };
}

function sampleAtProgress(trial: NormalizedTrial, progress: number) {
  return trial.frames[Math.round(progress * (trial.frames.length - 1))];
}

function technicalPhaseAtProgress(eventTiming: readonly DryadTechnicalEventTiming[], progress: number): string {
  let current = eventTiming[0].eventId;
  for (const event of eventTiming) {
    if (event.medianProgress > progress) break;
    current = event.eventId;
  }
  return current.toLocaleLowerCase('en-US');
}

/**
 * Produces a non-reversible cohort signal. Only medians and dispersion survive;
 * no participant trajectory or participant ID is embedded in the asset.
 */
export function buildDryadTechnicalCohortAsset(input: {
  trials: readonly DryadMotionTrial[];
  generatedFromDigest: string;
  frameCount?: number;
}): DryadTechnicalCohortAsset {
  const frameCount = Math.floor(input.frameCount ?? DEFAULT_FRAME_COUNT);
  if (input.trials.length < 2 || frameCount < 11 || !/^[a-f0-9]{64}$/i.test(input.generatedFromDigest)) {
    throw new Error('Dryad technical cohort input is incomplete.');
  }
  const exerciseId = input.trials[0].exerciseId;
  if (input.trials.some(trial => trial.exerciseId !== exerciseId)) throw new Error('Dryad cohort mixes movements.');
  if (new Set(input.trials.map(trial => trial.clipId)).size !== input.trials.length) {
    throw new Error('Dryad cohort contains duplicate trials.');
  }
  const spec = DRYAD_MOVEMENT_SPECS[exerciseId];
  const normalized = input.trials.map(normalizeTrial);
  const eventTiming = Object.freeze(spec.eventOrder.map((eventId): DryadTechnicalEventTiming => {
    const eventIndex = input.trials[0].events.findIndex(event => event.id === eventId);
    const values = input.trials.map(trial => {
      const event = trial.events[eventIndex];
      const duration = trial.frames[trial.frames.length - 1].timeUs;
      if (!event || duration <= 0) throw new Error(`Dryad ${trial.clipId} lacks event ${eventId}.`);
      return Math.max(0, Math.min(1, event.timeUs / duration));
    });
    return Object.freeze({
      eventId,
      label: spec.eventLabels[eventId],
      medianProgress: median(values),
      p10Progress: quantile(values, 0.1),
      p90Progress: quantile(values, 0.9),
      sourceSampleCount: values.length,
    });
  }));

  const durations = input.trials.map(trial => trial.frames[trial.frames.length - 1].timeUs);
  const medianDurationUs = Math.max(1, Math.round(median(durations)));
  const footSpreads: number[] = [];
  const frames: DryadTechnicalCohortFrame[] = [];
  for (let index = 0; index < frameCount; index++) {
    const progress = index / (frameCount - 1);
    const samples = normalized.map(trial => sampleAtProgress(trial, progress));
    const joints = Object.freeze(Object.fromEntries(JOINT_IDS.map(jointId => {
      const x = median(samples.map(sample => sample[jointId].x));
      const y = median(samples.map(sample => sample[jointId].y));
      const z = median(samples.map(sample => sample[jointId].z));
      if (jointId === 'footL' || jointId === 'footR') {
        footSpreads.push(...samples.map(sample => Math.hypot(
          sample[jointId].x - x,
          sample[jointId].y - y,
          sample[jointId].z - z,
        )));
      }
      return [jointId, point(x, y, z)];
    }))) as DryadTechnicalCohortFrame['joints'];
    frames.push(Object.freeze({
      timeUs: Math.round(progress * medianDurationUs),
      progress,
      technicalPhaseId: technicalPhaseAtProgress(eventTiming, progress),
      joints,
    }));
  }
  const participantCount = new Set(input.trials.map(trial => trial.participantId)).size;
  const bilateral = spec.laterality === 'bilateral';
  return Object.freeze({
    schemaVersion: 1,
    generatedFromDigest: input.generatedFromDigest,
    clip: Object.freeze({
      schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
      clipId: `dryad-${exerciseId}-cohort-${input.trials.length}`,
      exerciseId,
      label: `Dryad ${spec.label} · Kohorte ${input.trials.length} Versuche`,
      frameRateHz: 250,
      coordinateSystem: 'balletos_body_normalized_right_up_forward',
      workingSide: bilateral ? 'bilateral' : 'right',
      cohortSize: input.trials.length,
      participantCount,
      sourceTrialCount: input.trials.length,
      provenance: Object.freeze({
        datasetId: `dryad:10.5061/dryad.dncjsxm8v:2025-01-02:${exerciseId}:cohort-aggregate`,
        sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
        sourceKind: 'optical_marker',
        rightsStatus: 'product_technical_signal_allowed',
        licenseLabel: 'CC0-1.0 · nicht-reversible Kohortenverdichtung',
        pedagogicalStatus: 'technical_only',
        nicoleReviewStatus: 'not_reviewed',
        sourceDigest: input.generatedFromDigest,
      }),
      frames: Object.freeze(frames),
    }),
    eventTiming,
    medianDurationUs,
    p90FootPathSpread: quantile(footSpreads, 0.9),
  });
}

