import type { SkeletonPointId } from './skeletonTarget';

export const CANONICAL_MOTION_SCHEMA_VERSION = 1 as const;

export type CanonicalJointId = SkeletonPointId;
export type CanonicalMotionPhaseId =
  | 'departure'
  | 'extension'
  | 'full_extension'
  | 'return'
  | 'closure';

export const TENDU_PHASE_ORDER: readonly CanonicalMotionPhaseId[] = Object.freeze([
  'departure',
  'extension',
  'full_extension',
  'return',
  'closure',
]);

export const TENDU_PHASE_LABELS: Readonly<Record<CanonicalMotionPhaseId, string>> = Object.freeze({
  departure: 'Ausgang',
  extension: 'Abstreichen',
  full_extension: 'Volle Streckung',
  return: 'Rückweg',
  closure: 'Schluss',
});

export type MotionRightsStatus =
  | 'product_technical_signal_allowed'
  | 'internal_research_only'
  | 'purchase_evaluation_only';

export interface MotionDatasetProvenance {
  datasetId: string;
  sourceUrl: string;
  sourceKind: 'optical_marker' | 'bvh_skeleton' | 'composite_technical' | 'authored_animation';
  rightsStatus: MotionRightsStatus;
  licenseLabel: string;
  pedagogicalStatus: 'technical_only';
  nicoleReviewStatus: 'not_reviewed';
  sourceDigest?: string;
}

/** Right-handed BalletOS coordinates: x=dancer right, y=up, z=forward. */
export interface CanonicalJointSample {
  x: number;
  y: number;
  z: number;
  confidence: number;
}

export interface CanonicalMotionFrame {
  timeUs: number;
  phaseId?: CanonicalMotionPhaseId;
  joints: Readonly<Partial<Record<CanonicalJointId, CanonicalJointSample>>>;
}

export interface CanonicalMotionClip {
  schemaVersion: typeof CANONICAL_MOTION_SCHEMA_VERSION;
  clipId: string;
  exerciseId: string;
  label: string;
  frameRateHz: number;
  coordinateSystem:
    | 'balletos_metric_right_up_forward'
    | 'balletos_body_normalized_right_up_forward';
  provenance: Readonly<MotionDatasetProvenance>;
  frames: readonly CanonicalMotionFrame[];
}

export interface TenduPhaseEvent {
  id: 'FRS' | 'VL' | 'FL' | 'VR' | 'FRE';
  label: string;
  timeUs: number;
}

export interface DryadTenduSignalClip extends CanonicalMotionClip {
  exerciseId: 'tendu';
  workingSide: 'left' | 'right';
}

export interface DryadTenduClip extends DryadTenduSignalClip {
  participantId: number;
  trial: number;
  events: readonly TenduPhaseEvent[];
}

export interface DryadTenduCohortClip extends DryadTenduSignalClip {
  cohortSize: number;
  participantCount: number;
  sourceTrialCount: number;
}

export interface DryadTenduPhaseDispersion {
  phaseId: CanonicalMotionPhaseId;
  medianRadialSpread: number;
  p90RadialSpread: number;
  sourceSampleCount: number;
}

export interface DryadTenduCohortAsset {
  schemaVersion: 1;
  generatedFromDigest: string;
  clip: DryadTenduCohortClip;
  phaseDispersion: readonly DryadTenduPhaseDispersion[];
}

export interface SpatialStabilityReport {
  sampledFrames: number;
  mappedJointRatio: number;
  medianSegmentLengthCv: number;
  stable: boolean;
}

export interface TenduTechnicalPrototype {
  clip: CanonicalMotionClip;
  workingSide: 'left' | 'right';
  dryadPhaseCoverage: number;
  dryadFootExcursionMeters: number;
  fullBodyStability: SpatialStabilityReport;
  productEligible: false;
  limitations: readonly string[];
}
