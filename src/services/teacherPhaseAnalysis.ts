import { BUILD_POLICY } from '../config/buildPolicy';
import {
  heuristicBaseState,
  heuristicEvidenceStrength,
  TEACHER_REGION_KEYS,
  TeacherHeuristicBaseState,
  TeacherHeuristicState,
  TeacherOverlayPacket,
  TeacherRegionKey,
  withEvidenceStrength,
} from '../types/teacherHeuristic';
import type { FrameEntry } from './frameInterpolator';
import type { PoseLandmark } from './realMediaPipePose';
import { TeacherHeuristicEngine } from './teacherHeuristicEngine';
import { vaganova3DKinematics } from './vaganova3DKinematics';
import { VaganovaAngleCalculator } from './vaganovaAngleCalculator';
import { vaganovaKineticAI } from './vaganovaKineticAI';
import { vaganovaMotionClassifier } from './vaganovaMotionClassifier';

export type PliePhaseId = 'setup' | 'descent' | 'bottom' | 'ascent' | 'finish';

export interface FrameImageQuality {
  /** Normalized Laplacian edge energy, 0..1. */
  sharpnessScore: number;
  /** Normalized border-frame difference; null for the first sampled frame. */
  backgroundMotionScore: number | null;
}

export interface RecordingGateCheck {
  id:
    | 'exercise_level'
    | 'pose_coverage'
    | 'full_body'
    | 'perspective'
    | 'person_size'
    | 'target_tracking'
    | 'feet_joints'
    | 'sharpness'
    | 'camera_stability'
    | 'complete_plie_cycle';
  label: string;
  passed: boolean;
  detail: string;
}

export interface RecordingGateResult {
  status: 'ready' | 'needs_correction';
  checks: readonly RecordingGateCheck[];
  correctiveActions: readonly string[];
  detectedPerspective: 'FRONTAL' | 'PROFILE_RIGHT' | 'PROFILE_LEFT' | null;
}

export interface TeacherPhaseRegionSummary {
  state: TeacherHeuristicState;
  corridorResult: 'inside' | 'overlap' | 'outside';
  sampleCount: number;
  agreement: number;
  uncertainRatio: number;
}

export interface TeacherPhaseResult {
  id: PliePhaseId;
  label: string;
  startMs: number;
  endMs: number;
  representativeTimeMs: number;
  regions: Readonly<Record<TeacherRegionKey, TeacherPhaseRegionSummary>>;
  displayState: TeacherHeuristicState;
}

export interface TeacherPhaseAnalysis {
  schemaVersion: 1;
  exerciseLabel: string;
  levelLabel: string;
  gate: RecordingGateResult;
  phases: readonly TeacherPhaseResult[];
  framesAnalyzed: number;
  policyVersion: string;
}

export interface TeacherPhaseAnalysisInput {
  frames: readonly FrameEntry[];
  videoWidth: number;
  videoHeight: number;
  exerciseLabel: string;
  levelLabel: string;
}

interface PhaseBoundary {
  id: PliePhaseId;
  label: string;
  startIndex: number;
  endIndex: number;
  representativeIndex: number;
}

interface PoseSample {
  frame: FrameEntry;
  landmarks: PoseLandmark[];
  kneeAngle: number;
  perspective: 'FRONTAL' | 'PROFILE_RIGHT' | 'PROFILE_LEFT';
  torsoCenter: { x: number; y: number };
  bbox: { width: number; height: number };
  packet: TeacherOverlayPacket;
}

const REQUIRED_BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32] as const;
const FEET_AND_JOINTS = [11, 12, 23, 24, 25, 26, 27, 28, 31, 32] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function landmarkUsable(landmark: PoseLandmark | undefined, minVisibility = 0.55): boolean {
  return Boolean(landmark)
    && Number.isFinite(landmark!.x)
    && Number.isFinite(landmark!.y)
    && landmark!.x >= -0.05
    && landmark!.x <= 1.05
    && landmark!.y >= -0.05
    && landmark!.y <= 1.05
    && Number.isFinite(landmark!.visibility)
    && (landmark!.visibility as number) >= minVisibility;
}

function averageKneeAngle(landmarks: readonly PoseLandmark[], videoWidth: number, videoHeight: number): number {
  const angle = (hip: PoseLandmark, knee: PoseLandmark, ankle: PoseLandmark) => {
    const ax = (hip.x - knee.x) * videoWidth;
    const ay = (hip.y - knee.y) * videoHeight;
    const bx = (ankle.x - knee.x) * videoWidth;
    const by = (ankle.y - knee.y) * videoHeight;
    const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (!Number.isFinite(denominator) || denominator <= 1e-6) return null;
    const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator));
    return Math.acos(cosine) * 180 / Math.PI;
  };
  const left = angle(landmarks[23], landmarks[25], landmarks[27]);
  const right = angle(landmarks[24], landmarks[26], landmarks[28]);
  const values = [left, right].filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
}

/** Pure image-quality metric used by the pre-indexer on a small luma frame. */
export function calculateFrameImageQuality(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  previousLuma: Uint8Array | null,
): { quality: FrameImageQuality; luma: Uint8Array } {
  if (width < 3 || height < 3 || rgba.length !== width * height * 4) {
    return { quality: { sharpnessScore: 0, backgroundMotionScore: null }, luma: new Uint8Array() };
  }
  const luma = new Uint8Array(width * height);
  for (let index = 0; index < luma.length; index++) {
    const offset = index * 4;
    luma[index] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
  }

  let laplacianSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = Math.abs(
        4 * luma[index]
        - luma[index - 1]
        - luma[index + 1]
        - luma[index - width]
        - luma[index + width]
      );
      laplacianSum += laplacian;
      laplacianCount++;
    }
  }
  const sharpnessScore = clamp01((laplacianSum / Math.max(1, laplacianCount) / 255) * 8);

  let backgroundMotionScore: number | null = null;
  if (previousLuma && previousLuma.length === luma.length) {
    let difference = 0;
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const border = x < width * 0.18 || x > width * 0.82 || y < height * 0.15;
        if (!border) continue;
        const index = y * width + x;
        difference += Math.abs(luma[index] - previousLuma[index]);
        count++;
      }
    }
    backgroundMotionScore = clamp01(difference / Math.max(1, count) / 255);
  }

  return { quality: { sharpnessScore, backgroundMotionScore }, luma };
}

function smooth(values: readonly number[], radius = 2): number[] {
  return values.map((_value, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let total = 0;
    for (let cursor = start; cursor <= end; cursor++) total += values[cursor];
    return total / (end - start + 1);
  });
}

function detectPliePhases(samples: readonly PoseSample[]): PhaseBoundary[] | null {
  if (samples.length < 20) return null;
  const angles = smooth(samples.map(sample => sample.kneeAngle));
  const edgeCount = Math.max(3, Math.floor(angles.length * 0.12));
  const baseline = median([...angles.slice(0, edgeCount), ...angles.slice(-edgeCount)]);
  let bottomIndex = 0;
  for (let index = 1; index < angles.length; index++) {
    if (angles[index] < angles[bottomIndex]) bottomIndex = index;
  }
  const range = baseline - angles[bottomIndex];
  if (range < 12 || bottomIndex < edgeCount || bottomIndex >= angles.length - edgeCount) return null;

  const depth = angles.map(angle => (baseline - angle) / range);
  let descentStart = 0;
  for (let index = 0; index < bottomIndex; index++) {
    if (depth[index] >= 0.12) { descentStart = index; break; }
  }
  let bottomStart = bottomIndex;
  while (bottomStart > descentStart && depth[bottomStart - 1] >= 0.82) bottomStart--;
  let bottomEnd = bottomIndex;
  while (bottomEnd < angles.length - 1 && depth[bottomEnd + 1] >= 0.82) bottomEnd++;
  let ascentEnd = angles.length - 1;
  for (let index = bottomEnd + 1; index < angles.length; index++) {
    if (depth[index] <= 0.12) { ascentEnd = index; break; }
  }

  if (descentStart < 2 || bottomStart - descentStart < 2 || ascentEnd - bottomEnd < 2 || ascentEnd >= angles.length - 1) return null;
  return [
    { id: 'setup', label: 'Ausgangsposition', startIndex: 0, endIndex: descentStart - 1, representativeIndex: Math.floor(descentStart / 2) },
    { id: 'descent', label: 'Abwärtsbewegung', startIndex: descentStart, endIndex: bottomStart - 1, representativeIndex: Math.floor((descentStart + bottomStart - 1) / 2) },
    { id: 'bottom', label: 'Tiefster Plié-Punkt', startIndex: bottomStart, endIndex: bottomEnd, representativeIndex: bottomIndex },
    { id: 'ascent', label: 'Aufwärtsbewegung', startIndex: bottomEnd + 1, endIndex: ascentEnd, representativeIndex: Math.floor((bottomEnd + 1 + ascentEnd) / 2) },
    { id: 'finish', label: 'Abschluss', startIndex: ascentEnd + 1, endIndex: angles.length - 1, representativeIndex: Math.floor((ascentEnd + 1 + angles.length - 1) / 2) },
  ];
}

export function summarizePhaseRegionStates(
  states: readonly TeacherHeuristicState[],
): TeacherPhaseRegionSummary {
  const baseStates = states
    .map(heuristicBaseState)
    .filter((state): state is TeacherHeuristicBaseState => state !== null);
  const counts: Record<TeacherHeuristicBaseState, number> = {
    heuristic_match: 0,
    heuristic_attention: 0,
    heuristic_strong_attention: 0,
  };
  for (const state of baseStates) counts[state]++;
  const sampleCount = baseStates.length;
  if (sampleCount === 0) {
    return {
      state: 'blocked',
      corridorResult: 'overlap',
      sampleCount: 0,
      agreement: 0,
      uncertainRatio: states.length > 0 ? 1 : 0,
    };
  }
  const winningCount = Math.max(...Object.values(counts));
  const severityMean = (
    counts.heuristic_attention + counts.heuristic_strong_attention * 2
  ) / sampleCount;
  // Die Farbe beschreibt die Leistung ueber das Phasenfenster. Ein 50/50-
  // Verlauf aus Gruen und Rot ist fachlich Gelb; Farbstreuung allein ist aber
  // keine Erkennungsunsicherheit und erzeugt deshalb keine Punkttextur.
  const base: TeacherHeuristicBaseState = severityMean < 0.5
    ? 'heuristic_match'
    : severityMean > 1.5
      ? 'heuristic_strong_attention'
      : 'heuristic_attention';
  const corridorResult: TeacherPhaseRegionSummary['corridorResult'] = base === 'heuristic_match'
    ? 'inside'
    : base === 'heuristic_strong_attention'
      ? 'outside'
      : 'overlap';
  const agreement = winningCount / Math.max(1, sampleCount);
  const strengths = states.map(heuristicEvidenceStrength);
  const weakRatio = strengths.filter(strength => strength === 'weak').length
    / Math.max(1, states.length);
  const uncertainRatio = strengths.filter(strength => strength !== 'stable').length
    / Math.max(1, states.length);
  const coverage = sampleCount / Math.max(1, states.length);
  const evidenceStrength = coverage < 0.5 || weakRatio >= 0.5 || uncertainRatio >= 0.75
    ? 'weak'
    : sampleCount < 3 || coverage < 1 || uncertainRatio > 0
      ? 'uncertain'
      : 'stable';
  return {
    state: withEvidenceStrength(base, evidenceStrength),
    corridorResult,
    sampleCount,
    agreement,
    uncertainRatio,
  };
}

function aggregateRegion(samples: readonly PoseSample[], key: TeacherRegionKey): TeacherPhaseRegionSummary {
  return summarizePhaseRegionStates(samples.map(sample => sample.packet[key]));
}

function phaseDisplayState(regions: Readonly<Record<TeacherRegionKey, TeacherPhaseRegionSummary>>): TeacherHeuristicState {
  const states = TEACHER_REGION_KEYS.map(key => regions[key].state);
  const baseStates = states.map(heuristicBaseState).filter((state): state is TeacherHeuristicBaseState => state !== null);
  if (baseStates.length === 0) return 'blocked';
  const severityMean = baseStates.reduce((sum, state) => (
    sum + (state === 'heuristic_match' ? 0 : state === 'heuristic_attention' ? 1 : 2)
  ), 0) / baseStates.length;
  const base: TeacherHeuristicBaseState = severityMean < 0.5
    ? 'heuristic_match'
    : severityMean > 1.5
      ? 'heuristic_strong_attention'
      : 'heuristic_attention';
  const strengths = states.map(heuristicEvidenceStrength);
  const weakRatio = strengths.filter(strength => strength === 'weak').length / strengths.length;
  const strength = weakRatio >= 1 / 3
    ? 'weak'
    : strengths.some(value => value !== 'stable')
      ? 'uncertain'
      : 'stable';
  return withEvidenceStrength(base, strength);
}

function gateCheck(id: RecordingGateCheck['id'], label: string, passed: boolean, detail: string): RecordingGateCheck {
  return { id, label, passed, detail };
}

export function analyzeTeacherPhases(input: TeacherPhaseAnalysisInput): TeacherPhaseAnalysis {
  const exerciseAndLevelSelected = input.exerciseLabel.toLocaleLowerCase('de-DE').includes('pli')
    && input.levelLabel.trim().length > 0;
  const poseFrames = input.frames.filter((frame): frame is FrameEntry & { landmarks: PoseLandmark[] } => (
    frame.resultKind !== 'no_pose' && Array.isArray(frame.landmarks) && frame.landmarks.length >= 33
  ));
  const totalFrames = Math.max(1, input.frames.length);
  const poseCoverage = poseFrames.length / totalFrames;
  const fullBodyRatio = poseFrames.filter(frame => REQUIRED_BODY.every(index => landmarkUsable(frame.landmarks[index]))).length
    / Math.max(1, poseFrames.length);
  const feetRatio = poseFrames.filter(frame => FEET_AND_JOINTS.every(index => landmarkUsable(frame.landmarks[index]))).length
    / Math.max(1, poseFrames.length);
  const perspectives = poseFrames.map(frame => vaganovaMotionClassifier.classify(frame.landmarks).detectedPerspective);
  const perspectiveCounts = perspectives.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
  const dominantPerspectiveEntry = Object.entries(perspectiveCounts).sort((a, b) => b[1] - a[1])[0];
  const detectedPerspective = (dominantPerspectiveEntry?.[0] ?? null) as RecordingGateResult['detectedPerspective'];
  // Left/right profile jitter describes the dancer's orientation, not a camera
  // change. The recording gate therefore distinguishes the two camera planes
  // (frontal/profile) and keeps the side only as diagnostic detail.
  const frontalCount = perspectiveCounts.FRONTAL ?? 0;
  const profileCount = (perspectiveCounts.PROFILE_LEFT ?? 0) + (perspectiveCounts.PROFILE_RIGHT ?? 0);
  const perspectivePlane = profileCount > frontalCount ? 'Profil' : 'Frontal';
  const perspectiveRatio = Math.max(frontalCount, profileCount) / Math.max(1, poseFrames.length);

  const bboxes = poseFrames.map(frame => {
    const usable = REQUIRED_BODY.map(index => frame.landmarks[index]).filter(landmark => landmarkUsable(landmark, 0.3));
    return {
      width: Math.max(...usable.map(point => point.x)) - Math.min(...usable.map(point => point.x)),
      height: Math.max(...usable.map(point => point.y)) - Math.min(...usable.map(point => point.y)),
    };
  }).filter(box => Number.isFinite(box.width) && Number.isFinite(box.height));
  const medianWidth = median(bboxes.map(box => box.width));
  const medianHeight = median(bboxes.map(box => box.height));

  const torsoCenters = poseFrames.map(frame => ({
    x: (frame.landmarks[11].x + frame.landmarks[12].x + frame.landmarks[23].x + frame.landmarks[24].x) / 4,
    y: (frame.landmarks[11].y + frame.landmarks[12].y + frame.landmarks[23].y + frame.landmarks[24].y) / 4,
  }));
  const trackingSteps = torsoCenters.slice(1).map((center, index) => Math.hypot(
    center.x - torsoCenters[index].x,
    center.y - torsoCenters[index].y,
  ));
  const stableTrackingRatio = trackingSteps.filter(step => step <= 0.12).length / Math.max(1, trackingSteps.length);

  const quality = input.frames.map(frame => frame.imageQuality).filter((value): value is FrameImageQuality => Boolean(value));
  const sharpness = median(quality.map(value => value.sharpnessScore));
  const cameraMotion = median(quality
    .map(value => value.backgroundMotionScore)
    .filter((value): value is number => value !== null));

  const calculator = new VaganovaAngleCalculator();
  const engine = new TeacherHeuristicEngine();
  const samples: PoseSample[] = poseFrames.flatMap(frame => {
    const kneeAngle = averageKneeAngle(frame.landmarks, input.videoWidth, input.videoHeight);
    if (!Number.isFinite(kneeAngle)) return [];
    const skeleton = vaganova3DKinematics.solve(frame.landmarks, null, input.videoWidth, input.videoHeight);
    const motion = vaganovaMotionClassifier.classify(frame.landmarks);
    const analysis = calculator.analyzeFullFrame(frame.landmarks, input.videoWidth, input.videoHeight);
    const cog = vaganovaKineticAI.computeCenterOfGravity(skeleton);
    const usable = REQUIRED_BODY.map(index => frame.landmarks[index]).filter(landmark => landmarkUsable(landmark, 0.3));
    return [{
      frame,
      landmarks: frame.landmarks,
      kneeAngle,
      perspective: motion.detectedPerspective,
      torsoCenter: {
        x: (frame.landmarks[11].x + frame.landmarks[12].x + frame.landmarks[23].x + frame.landmarks[24].x) / 4,
        y: (frame.landmarks[11].y + frame.landmarks[12].y + frame.landmarks[23].y + frame.landmarks[24].y) / 4,
      },
      bbox: {
        width: Math.max(...usable.map(point => point.x)) - Math.min(...usable.map(point => point.x)),
        height: Math.max(...usable.map(point => point.y)) - Math.min(...usable.map(point => point.y)),
      },
      packet: engine.compute(analysis, skeleton, frame.timeMs / 1000, 0, { motion, cogX: cog.x }),
    }];
  });
  const boundaries = detectPliePhases(samples);

  const checks: RecordingGateCheck[] = [
    gateCheck('exercise_level', 'Plié und Stufe ausgewählt', exerciseAndLevelSelected, `${input.exerciseLabel || 'Übung fehlt'} · ${input.levelLabel || 'Stufe fehlt'}`),
    gateCheck('pose_coverage', 'Körper durchgängig erkannt', poseCoverage >= 0.75, `${Math.round(poseCoverage * 100)} % der Analyseframes`),
    gateCheck('full_body', 'Vollständiger Körper sichtbar', fullBodyRatio >= 0.7, `${Math.round(fullBodyRatio * 100)} % mit Kopf, Armen, Beinen und Füßen`),
    gateCheck('perspective', 'Kameraperspektive eindeutig', perspectiveRatio >= 0.75, `${perspectivePlane} · ${Math.round(perspectiveRatio * 100)} % stabil · dominant ${detectedPerspective ?? 'nicht erkannt'}`),
    gateCheck('person_size', 'Person ausreichend groß', medianHeight >= 0.32 && medianWidth >= 0.16, `${Math.round(medianHeight * 100)} % Bildhöhe · ${Math.round(medianWidth * 100)} % Bildbreite`),
    gateCheck('target_tracking', 'Zielperson eindeutig verfolgt', stableTrackingRatio >= 0.85, `${Math.round(stableTrackingRatio * 100)} % stabile Tracking-Schritte`),
    gateCheck('feet_joints', 'Füße und relevante Gelenke sichtbar', feetRatio >= 0.72, `${Math.round(feetRatio * 100)} % vollständig`),
    gateCheck('sharpness', 'Ausreichende Bildschärfe', quality.length >= totalFrames * 0.7 && sharpness >= 0.08, `Schärfeindex ${sharpness.toFixed(2)}`),
    gateCheck('camera_stability', 'Kamera stabil', quality.length >= totalFrames * 0.7 && cameraMotion <= 0.12, `Hintergrundbewegung ${cameraMotion.toFixed(2)}`),
    gateCheck('complete_plie_cycle', 'Vollständiger Plié-Zyklus erkannt', boundaries !== null, boundaries ? '5 Phasen erkannt' : 'Ausgang, Tiefpunkt oder Abschluss fehlt'),
  ];
  const correctiveActions = checks.filter(check => !check.passed).map(check => check.label);
  const gate: RecordingGateResult = {
    status: correctiveActions.length === 0 ? 'ready' : 'needs_correction',
    checks,
    correctiveActions,
    detectedPerspective,
  };

  const phases: TeacherPhaseResult[] = gate.status === 'ready' && boundaries
    ? boundaries.map(boundary => {
      const phaseSamples = samples.slice(boundary.startIndex, boundary.endIndex + 1);
      const regions = Object.fromEntries(
        TEACHER_REGION_KEYS.map(key => [key, aggregateRegion(phaseSamples, key)]),
      ) as Record<TeacherRegionKey, TeacherPhaseRegionSummary>;
      return {
        id: boundary.id,
        label: boundary.label,
        startMs: phaseSamples[0].frame.timeMs,
        endMs: phaseSamples[phaseSamples.length - 1].frame.timeMs,
        representativeTimeMs: samples[boundary.representativeIndex].frame.timeMs,
        regions,
        displayState: phaseDisplayState(regions),
      };
    })
    : [];

  return Object.freeze({
    schemaVersion: 1,
    exerciseLabel: input.exerciseLabel,
    levelLabel: input.levelLabel,
    gate,
    phases,
    framesAnalyzed: samples.length,
    policyVersion: BUILD_POLICY.policyVersion,
  });
}

export function findTeacherPhaseAtTime(
  analysis: TeacherPhaseAnalysis | null,
  timeMs: number,
): TeacherPhaseResult | null {
  if (!analysis || analysis.gate.status !== 'ready' || analysis.phases.length === 0 || !Number.isFinite(timeMs)) return null;
  return analysis.phases.find(phase => timeMs >= phase.startMs && timeMs <= phase.endMs)
    ?? analysis.phases.reduce((closest, phase) => (
      Math.abs(phase.representativeTimeMs - timeMs) < Math.abs(closest.representativeTimeMs - timeMs)
        ? phase
        : closest
    ));
}

export function phaseToOverlayPacket(
  phase: TeacherPhaseResult,
  framePtsSeconds: number,
  streamEpoch: number,
): TeacherOverlayPacket {
  const states = Object.fromEntries(
    TEACHER_REGION_KEYS.map(key => [key, phase.regions[key].state]),
  ) as Pick<TeacherOverlayPacket, TeacherRegionKey>;
  return {
    ...states,
    policyVersion: BUILD_POLICY.policyVersion,
    streamEpoch,
    framePtsSeconds,
  };
}
