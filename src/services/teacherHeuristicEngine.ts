/**
 * teacherHeuristicEngine.ts
 *
 * Wandelt VaganovaFullAnalysis (Rohwerte, kein Status) in ein
 * TeacherOverlayPacket (Heuristik-Zustände) um.
 *
 * ARCHITEKTUR-VERTRAG (Berater Heisig, 2026-08-11):
 *   – Dieser Service darf measurement_class prüfen und Heuristik berechnen.
 *   – Der Renderer darf das nicht.
 *   – Ein Moduswechsel startet keine neue Inferenz.
 *   – 'blocked' ist NIEMALS identisch mit 'heuristic_match'.
 *
 * Unzulässige Aussagen aus Pose-only:
 *   Core-Kraft, Bauchspannung, muskuläre Aktivierung,
 *   Ballen-/Fersendruck, COP, Gewichtsverteilung,
 *   echtes 3D-Turnout, Pronation/Supination.
 */

import {
  isMeasurableVaganovaMeasurement,
  VaganovaFullAnalysis,
  VaganovaMeasurement
} from './vaganovaAngleCalculator';
import { KinematicPoint, ReconstructedSkeleton } from './vaganova3DKinematics';
import { vaganovaArmAnalyzer, type ArmQualityStatus, type VaganovaArmPosition } from './vaganovaArmAnalyzer';
import type { MotionClassificationResult } from './vaganovaMotionClassifier';
import {
  heuristicBaseState,
  heuristicHasUncertainEvidence,
  TeacherHeuristicBaseState,
  TeacherHeuristicState,
  TeacherOverlayPacket,
  createBlockedPacket,
  withUncertainEvidence,
} from '../types/teacherHeuristic';
import { BUILD_POLICY, NEUTRAL_MEASUREMENT_CLASSES } from '../config/buildPolicy';

export interface TeacherHeuristicContext {
  motion: Pick<
    MotionClassificationResult,
    'detectedPerspective' | 'confidence' | 'isPlie' | 'isArabesque'
  >;
  /** Display-only projected torso-center proxy, never pressure/COP. */
  cogX: number;
}

// ─── GATES ──────────────────────────────────────────────────────────────────

/**
 * Prüft ob eine VaganovaMeasurement für die Lehrer-Heuristik verwendet werden darf.
 * Gibt false zurück wenn:
 *   – Kein Wert vorhanden (null/undefined)
 *   – measurement_class in NEUTRAL_MEASUREMENT_CLASSES
 *   – measurement_class === 'validated_system_threshold' (zu stark – nur für zert. Scoring)
 *   – confidence < Mindest-Schwelle
 */
function isEligible(
  m: VaganovaMeasurement | null | undefined,
  minConfidence = 0.35
): m is Extract<VaganovaMeasurement, { measurement_class: Exclude<VaganovaMeasurement['measurement_class'], 'not_measurable'> }> {
  if (!isMeasurableVaganovaMeasurement(m)) return false;
  if (!Number.isFinite(m.value) || !Number.isFinite(m.confidence)) return false;
  if (m.confidence < 0 || m.confidence > 1) return false;
  if (NEUTRAL_MEASUREMENT_CLASSES.has(m.measurement_class as any)) return false;
  if (m.measurement_class === 'validated_system_threshold') return false;
  if (m.confidence < minConfidence) return false;
  return true;
}

// ─── HEURISTIK-RESOLVER ─────────────────────────────────────────────────────

/**
 * Kombiniert mehrere sichtbare Teilrelationen. Fehlende Teilmessungen erfinden
 * keine gelbe Grundfarbe: Die vorhandenen Relationen bestimmen die Farbe,
 * die Luecke wird ausschliesslich durch die feine Punkttextur markiert.
 */
function combineStates(states: TeacherHeuristicState[]): TeacherHeuristicState {
  const baseStates = states.map(heuristicBaseState).filter((state): state is TeacherHeuristicBaseState => state !== null);
  const uncertain = states.some(heuristicHasUncertainEvidence) || baseStates.length !== states.length;
  const combined: TeacherHeuristicBaseState | null = baseStates.includes('heuristic_strong_attention')
    ? 'heuristic_strong_attention'
    : baseStates.includes('heuristic_attention')
      ? 'heuristic_attention'
      : baseStates.length > 0
        ? 'heuristic_match'
        : null;
  return combined ? withUncertainEvidence(combined, uncertain) : 'blocked';
}

function finiteMeasurementValue(m: VaganovaMeasurement | null | undefined): number | null {
  return isMeasurableVaganovaMeasurement(m) && Number.isFinite(m.value) ? m.value : null;
}

function classifyDegrees(
  value: number,
  matchMax: number,
  attentionMax: number,
): TeacherHeuristicBaseState {
  const deg = Math.abs(value);
  if (deg <= matchMax) return 'heuristic_match';
  if (deg <= attentionMax) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

// ─── EINZEL-HEURISTIKEN ─────────────────────────────────────────────────────

function computeSpine(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.spineTilt;
  const value = finiteMeasurementValue(m);
  if (value === null) return 'blocked';
  // Mit isotropischer vw/vh-Korrektur: Rauschboden ~1-2°.
  // Vaganova-Standard: Wirbelsäule lotrecht, Abweichung >4° ist sichtbar.
  return withUncertainEvidence(classifyDegrees(value, 4, 10), !isEligible(m));
}

function computeShoulder(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.shoulderSymmetry;
  const value = finiteMeasurementValue(m);
  if (value === null) return 'blocked';
  // Schulter-Symmetrie: Nicole sieht Asymmetrie ab ~3°.
  // Épaulement kann 3-5° erzeugen, darüber ist es Haltungsfehler.
  return withUncertainEvidence(classifyDegrees(value, 5, 12), !isEligible(m));
}

function computePelvis(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.pelvicTilt;
  const value = finiteMeasurementValue(m);
  if (value === null) return 'blocked';
  // Becken-Neigung: Vaganova verlangt neutrales Becken.
  // >5° sichtbare Neigung, >12° deutlicher Fehler.
  return withUncertainEvidence(classifyDegrees(value, 5, 12), !isEligible(m));
}

/**
 * projected_torso_alignment:
 * Kombiniert Spine + Schulter-Relation + Becken-Neigung.
 * Nicht zulässig: Core-Kraft, Bauchspannung, segmentale Wirbelsäule.
 */
function computeTorsoAlignment(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const spine   = computeSpine(va);
  const shoulder = computeShoulder(va);
  const pelvis  = computePelvis(va);
  return combineStates([spine, shoulder, pelvis]);
}

function pointIsUsable(point: KinematicPoint | null | undefined): point is KinematicPoint {
  return Boolean(point)
    && Number.isFinite(point!.x)
    && Number.isFinite(point!.y)
    && Number.isFinite(point!.vis)
    && point!.vis >= 0.3
    && point!.isPredicted !== true;
}

function statusToState(status: ArmQualityStatus): TeacherHeuristicState {
  if (status === 'CORRECT') return 'heuristic_match';
  if (status === 'WARNING') return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function armAngleState(position: VaganovaArmPosition, angleDeg: number): TeacherHeuristicState {
  if (!Number.isFinite(angleDeg)) return 'blocked';
  if (position === 'TRANSITION') {
    const provisional = angleDeg >= 120 && angleDeg <= 165
      ? 'heuristic_match'
      : angleDeg >= 100 && angleDeg <= 175
        ? 'heuristic_attention'
        : 'heuristic_strong_attention';
    return withUncertainEvidence(provisional, true);
  }
  if (position === 'ALLONGE') {
    if (angleDeg >= 160) return 'heuristic_match';
    if (angleDeg >= 145) return 'heuristic_attention';
    return 'heuristic_strong_attention';
  }
  if (angleDeg >= 120 && angleDeg <= 150) return 'heuristic_match';
  if (angleDeg >= 100 && angleDeg <= 165) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

/** Visible 2D arm-shape relation. This is pedagogy, not muscle diagnosis. */
function computeArm(
  sk: ReconstructedSkeleton,
  side: 'L' | 'R',
  context: TeacherHeuristicContext | null,
): TeacherHeuristicState {
  const points = side === 'L'
    ? [sk.shoulderL, sk.elbowL, sk.wristL]
    : [sk.shoulderR, sk.elbowR, sk.wristR];
  if (!points.every(pointIsUsable)) return 'blocked';

  const positions = vaganovaArmAnalyzer.classifyArmPosition(sk);
  const quality = vaganovaArmAnalyzer.analyzeElbowQuality(sk);
  const position = side === 'L' ? positions.left : positions.right;
  const elbow = side === 'L' ? quality.left : quality.right;
  const shapeState = armAngleState(position, elbow.angleDeg);

  // Height is meaningful only for the open second-position relation. In third
  // position an elbow above the shoulder is expected and must not become red.
  const state = position === 'SECOND'
    ? combineStates([shapeState, statusToState(elbow.heightStatus)])
    : shapeState;
  return withUncertainEvidence(
    heuristicBaseState(state) ?? 'heuristic_attention',
    heuristicHasUncertainEvidence(state) || !context || context.motion.confidence < 35,
  );
}

function projectedKneeFootState(
  sk: ReconstructedSkeleton,
  side: 'L' | 'R',
  context: TeacherHeuristicContext | null,
): TeacherHeuristicState {
  const hip = side === 'L' ? sk.pelvisL : sk.pelvisR;
  const knee = side === 'L' ? sk.kneeL : sk.kneeR;
  const ankle = side === 'L' ? sk.ankleL : sk.ankleR;
  const foot = side === 'L' ? sk.footL : sk.footR;
  if (
    !pointIsUsable(hip)
    || !pointIsUsable(knee)
    || !pointIsUsable(ankle)
    || !pointIsUsable(foot)
  ) return 'blocked';

  const legLength = Math.max(1, Math.hypot(hip.x - ankle.x, hip.y - ankle.y));
  const deviationRatio = Math.abs(knee.x - foot.x) / legLength;
  const base: TeacherHeuristicBaseState = deviationRatio <= 0.10
    ? 'heuristic_match'
    : deviationRatio <= 0.20
      ? 'heuristic_attention'
      : 'heuristic_strong_attention';
  const uncertain = !context
    || context.motion.confidence < 35
    || context.motion.detectedPerspective !== 'FRONTAL'
    || context.motion.isArabesque;
  return withUncertainEvidence(base, uncertain);
}

/** Visible knee-to-foot projection; never labelled valgus or a joint diagnosis. */
function computeLeg(
  sk: ReconstructedSkeleton,
  side: 'L' | 'R',
  context: TeacherHeuristicContext | null,
): TeacherHeuristicState {
  return projectedKneeFootState(sk, side, context);
}

/**
 * projected_shin_foot_relation (früher SICKLE/WING).
 * Unvalidated teacher heuristic — braucht View+Visibility Gate.
 * Vorerst: nur dann nicht-blocked wenn Pose-Konfidenz ausreichend.
 */
function computeFoot(
  sk: ReconstructedSkeleton,
  side: 'L' | 'R',
  context: TeacherHeuristicContext | null,
): TeacherHeuristicState {
  const ankle = side === 'L' ? sk.ankleL : sk.ankleR;
  const foot = side === 'L' ? sk.footL : sk.footR;
  const hip = side === 'L' ? sk.pelvisL : sk.pelvisR;
  if (
    !pointIsUsable(ankle)
    || !pointIsUsable(foot)
    || !pointIsUsable(hip)
    || !pointIsUsable(sk.pelvisCenter)
  ) {
    return 'blocked';
  }

  // During a frontal plié the most useful visible relation is knee-over-foot.
  if (context?.motion.isPlie) return projectedKneeFootState(sk, side, context);

  // Outside plié, only assess whether the visible foot continues away from the
  // body centre. This is mirror-invariant and deliberately avoids turnout °.
  const outwardProduct = (foot.x - ankle.x) * (ankle.x - sk.pelvisCenter.x);
  const legLength = Math.max(1, Math.hypot(hip.x - ankle.x, hip.y - ankle.y));
  const horizontalReach = Math.abs(foot.x - ankle.x) / legLength;
  const base: TeacherHeuristicBaseState = outwardProduct < 0
    ? 'heuristic_strong_attention'
    : horizontalReach < 0.035
      ? 'heuristic_attention'
      : 'heuristic_match';
  const uncertain = !context
    || context.motion.confidence < 35
    || context.motion.detectedPerspective !== 'FRONTAL'
    || context.motion.isArabesque;
  return withUncertainEvidence(base, uncertain);
}

/**
 * projected_torso_center_proxy (früher CoG / Gewichtsverteilung).
 * Nur gültig wenn Rumpf, beide Knöchel und beide Füße sichtbar sind.
 * Grün bedeutet ausschließlich: die projizierte Rumpfmitte liegt im mittleren
 * Kandidatenband der sichtbaren Standfläche. Es ist kein Druck-/COP-Befund.
 */
function computeCog(
  sk: ReconstructedSkeleton,
  context: TeacherHeuristicContext | null,
): TeacherHeuristicState {
  if (
    !Number.isFinite(context?.cogX)
    || ![
      sk.sternum,
      sk.navel,
      sk.pelvisCenter,
      sk.ankleL,
      sk.ankleR,
      sk.footL,
      sk.footR,
    ].every(pointIsUsable)
  ) return 'blocked';

  const supportMin = Math.min(sk.ankleL.x, sk.ankleR.x, sk.footL!.x, sk.footR!.x);
  const supportMax = Math.max(sk.ankleL.x, sk.ankleR.x, sk.footL!.x, sk.footR!.x);
  const supportWidth = supportMax - supportMin;
  if (!Number.isFinite(supportWidth) || supportWidth <= 1) return 'blocked';
  const percent = ((context!.cogX - supportMin) / supportWidth) * 100;
  const base: TeacherHeuristicBaseState = percent >= 35 && percent <= 65
    ? 'heuristic_match'
    : percent >= 15 && percent <= 85
      ? 'heuristic_attention'
      : 'heuristic_strong_attention';
  const uncertain = !context
    || context.motion.confidence < 35
    || context.motion.detectedPerspective !== 'FRONTAL'
    || context.motion.isArabesque;
  return withUncertainEvidence(base, uncertain);
}

function computeHead(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.headTilt;
  const value = finiteMeasurementValue(m);
  if (value === null) return 'blocked';
  return withUncertainEvidence(classifyDegrees(value, 5, 15), !isEligible(m));
}

// ─── ENGINE ─────────────────────────────────────────────────────────────────

export class TeacherHeuristicEngine {
  /**
   * Berechnet den TeacherOverlayPacket aus Rohwerten.
   *
   * Gibt createBlockedPacket() zurück wenn:
   *   – allowExperimentalTeacherTrafficLight === false
   *   – vaganovaAnalysis oder skeleton fehlen
   */
  compute(
    va: VaganovaFullAnalysis | null,
    sk: ReconstructedSkeleton | null,
    framePtsSeconds: number,
    streamEpoch: number,
    context: TeacherHeuristicContext | null = null,
  ): TeacherOverlayPacket {
    if (!BUILD_POLICY.allowExperimentalTeacherTrafficLight || !va || !sk) {
      return createBlockedPacket(framePtsSeconds, streamEpoch);
    }

    return {
      torsoAlignment: computeTorsoAlignment(va),
      spine:     computeSpine(va),
      shoulder:  computeShoulder(va),
      pelvis:    computePelvis(va),
      armL:      computeArm(sk, 'L', context),
      armR:      computeArm(sk, 'R', context),
      legL:      computeLeg(sk, 'L', context),
      legR:      computeLeg(sk, 'R', context),
      footL:     computeFoot(sk, 'L', context),
      footR:     computeFoot(sk, 'R', context),
      cog:       computeCog(sk, context),
      head:      computeHead(va),
      policyVersion: BUILD_POLICY.policyVersion,
      streamEpoch,
      framePtsSeconds,
    };
  }
}

export const teacherHeuristicEngine = new TeacherHeuristicEngine();
