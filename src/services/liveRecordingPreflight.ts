import type { PoseLandmark } from './realMediaPipePose';
import { vaganovaMotionClassifier } from './vaganovaMotionClassifier';
import { resolveMotionRegistryEntry } from './motionRegistry';

export type LivePreflightStatus = 'checking' | 'ready' | 'ready_with_notes' | 'needs_correction';

export interface LivePreflightObservation {
  atMs: number;
  landmarks: readonly PoseLandmark[];
  sharpnessScore: number;
  cameraMotionScore: number | null;
}

export interface LivePreflightCheck {
  id: 'exercise' | 'pose' | 'full_body' | 'feet' | 'person_size' | 'perspective' | 'target' | 'sharpness' | 'camera';
  label: string;
  state: 'pass' | 'note' | 'correct';
  blocksStart: boolean;
  detail: string;
}

export interface LiveRecordingPreflight {
  status: LivePreflightStatus;
  progress: number;
  checks: readonly LivePreflightCheck[];
  headline: string;
  nextAction: string;
}

const REQUIRED_BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const FEET = [27, 28, 31, 32] as const;

function usable(point: PoseLandmark | undefined, minVisibility = 0.55): boolean {
  return Boolean(point)
    && Number.isFinite(point!.x) && Number.isFinite(point!.y)
    && point!.x >= -0.03 && point!.x <= 1.03 && point!.y >= -0.03 && point!.y <= 1.03
    && Number.isFinite(point!.visibility) && (point!.visibility as number) >= minVisibility;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ratio(observations: readonly LivePreflightObservation[], predicate: (observation: LivePreflightObservation) => boolean): number {
  return observations.filter(predicate).length / Math.max(1, observations.length);
}

function check(
  id: LivePreflightCheck['id'], label: string, state: LivePreflightCheck['state'], blocksStart: boolean, detail: string,
): LivePreflightCheck {
  return Object.freeze({ id, label, state, blocksStart: state === 'correct' && blocksStart, detail });
}

/**
 * Short live assistant, intentionally tolerant: hard technical absence blocks;
 * borderline classroom conditions remain startable and become evidence dots.
 */
export function evaluateLiveRecordingPreflight(input: Readonly<{
  observations: readonly LivePreflightObservation[];
  exerciseLabel: string;
  minimumObservations?: number;
}>): LiveRecordingPreflight {
  const minimum = Math.max(3, Math.floor(input.minimumObservations ?? 8));
  const observations = input.observations.filter(observation => (
    Number.isFinite(observation.atMs)
    && Number.isFinite(observation.sharpnessScore)
    && (observation.cameraMotionScore === null || Number.isFinite(observation.cameraMotionScore))
    && Array.isArray(observation.landmarks)
  ));
  const progress = Math.min(1, observations.length / minimum);
  const poseObservations = observations.filter(observation => observation.landmarks.length >= 33);
  const poseRatio = poseObservations.length / Math.max(1, observations.length);
  const motion = resolveMotionRegistryEntry(input.exerciseLabel);
  const exerciseSelected = motion !== null;

  if (observations.length < minimum) {
    return Object.freeze({
      status: 'checking', progress,
      checks: Object.freeze([
        check('exercise', 'Übung ausgewählt', exerciseSelected ? 'pass' : 'correct', true, input.exerciseLabel || 'Bitte Übung wählen'),
        check('pose', 'Körper wird erkannt', poseRatio >= 0.4 ? 'pass' : 'note', false, `${poseObservations.length}/${minimum} Prüfimpulse`),
      ]),
      headline: 'Kurzer Aufnahmecheck läuft …',
      nextAction: 'Bitte einmal vollständig in der Startposition stehen.',
    });
  }

  const fullBodyRatio = ratio(poseObservations, observation => REQUIRED_BODY.every(index => usable(observation.landmarks[index])));
  const feetRatio = ratio(poseObservations, observation => FEET.every(index => usable(observation.landmarks[index])));
  const boxes = poseObservations.flatMap(observation => {
    const points = REQUIRED_BODY.map(index => observation.landmarks[index]).filter(point => usable(point, 0.3));
    if (points.length < 8) return [];
    return [{
      width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
      height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)),
    }];
  });
  const medianWidth = median(boxes.map(box => box.width));
  const medianHeight = median(boxes.map(box => box.height));
  const perspectives = poseObservations.map(observation => vaganovaMotionClassifier.classify([...observation.landmarks]).detectedPerspective);
  const frontal = perspectives.filter(value => value === 'FRONTAL').length;
  const profile = perspectives.length - frontal;
  const perspectiveStability = Math.max(frontal, profile) / Math.max(1, perspectives.length);
  const centers = poseObservations.flatMap(observation => {
    const [sL, sR, hL, hR] = [11, 12, 23, 24].map(index => observation.landmarks[index]);
    if (![sL, sR, hL, hR].every(point => usable(point, 0.3))) return [];
    return [{ x: (sL.x + sR.x + hL.x + hR.x) / 4, y: (sL.y + sR.y + hL.y + hR.y) / 4 }];
  });
  const trackingSteps = centers.slice(1).map((center, index) => Math.hypot(center.x - centers[index].x, center.y - centers[index].y));
  const stableTargetRatio = trackingSteps.filter(value => value <= 0.12).length / Math.max(1, trackingSteps.length);
  const sharpness = median(observations.map(observation => observation.sharpnessScore));
  const cameraMotion = median(observations.flatMap(observation => observation.cameraMotionScore === null ? [] : [observation.cameraMotionScore]));

  const checks = Object.freeze([
    check('exercise', 'Übung ausgewählt', exerciseSelected ? 'pass' : 'correct', true, input.exerciseLabel || 'Bitte Übung wählen'),
    check('pose', 'Körper wird erkannt', poseRatio >= 0.7 ? 'pass' : poseRatio >= 0.35 ? 'note' : 'correct', poseRatio < 0.2, `${Math.round(poseRatio * 100)} % der Prüfimpulse`),
    check('full_body', 'Ganzer Körper im Bild', fullBodyRatio >= 0.7 ? 'pass' : fullBodyRatio >= 0.35 ? 'note' : 'correct', fullBodyRatio < 0.15, `${Math.round(fullBodyRatio * 100)} % vollständig`),
    check('feet', 'Füße sichtbar', feetRatio >= 0.72 ? 'pass' : feetRatio >= 0.35 ? 'note' : 'correct', feetRatio < 0.15, `${Math.round(feetRatio * 100)} % vollständig`),
    check('person_size', 'Abstand zur Kamera', medianHeight >= 0.32 && medianWidth >= 0.16 ? 'pass' : medianHeight >= 0.2 ? 'note' : 'correct', medianHeight < 0.12, `${Math.round(medianHeight * 100)} % Bildhöhe`),
    check('perspective', 'Perspektive stabil', perspectiveStability >= 0.75 ? 'pass' : 'note', false, `${Math.round(perspectiveStability * 100)} % gleiche Ansicht`),
    check('target', 'Zielperson stabil verfolgt', stableTargetRatio >= 0.82 ? 'pass' : 'note', false, `${Math.round(stableTargetRatio * 100)} % stabile Schritte · zweite Person bitte visuell prüfen`),
    check('sharpness', 'Bild ausreichend scharf', sharpness >= 0.08 ? 'pass' : sharpness >= 0.025 ? 'note' : 'correct', sharpness < 0.012, `Schärfe ${sharpness.toFixed(2)}`),
    check('camera', 'Kamera ruhig', cameraMotion <= 0.12 ? 'pass' : cameraMotion <= 0.35 ? 'note' : 'correct', cameraMotion > 0.65, `Hintergrundbewegung ${cameraMotion.toFixed(2)}`),
  ]);
  const blocking = checks.filter(item => item.blocksStart);
  const notes = checks.filter(item => item.state !== 'pass');
  const status: LivePreflightStatus = blocking.length > 0 ? 'needs_correction' : notes.length > 0 ? 'ready_with_notes' : 'ready';
  return Object.freeze({
    status, progress: 1, checks,
    headline: status === 'ready' ? 'Aufnahme kann starten'
      : status === 'ready_with_notes' ? 'Start möglich · Hinweise werden als Evidenzpunkte übernommen'
        : 'Vor dem Start kurz korrigieren',
    nextAction: status === 'ready' ? `${motion?.shortLabel ?? 'Übung'} einmal vollständig ausführen.`
      : status === 'ready_with_notes' ? notes.map(item => item.label).join(' · ')
        : blocking.map(item => item.label).join(' · '),
  });
}
