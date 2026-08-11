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

import { VaganovaFullAnalysis } from './vaganovaAngleCalculator';
import { vaganovaFootAnalyzer } from './vaganovaFootAnalyzer';
import { ReconstructedSkeleton } from './vaganova3DKinematics';
import {
  TeacherHeuristicState,
  TeacherOverlayPacket,
  createBlockedPacket,
} from '../types/teacherHeuristic';
import { BUILD_POLICY, NEUTRAL_MEASUREMENT_CLASSES } from '../config/buildPolicy';

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
  m: { measurement_class: string; confidence: number } | null | undefined,
  minConfidence = 0.35
): boolean {
  if (!m) return false;
  if (NEUTRAL_MEASUREMENT_CLASSES.has(m.measurement_class as any)) return false;
  if (m.measurement_class === 'validated_system_threshold') return false;
  if (m.confidence < minConfidence) return false;
  return true;
}

// ─── HEURISTIK-RESOLVER ─────────────────────────────────────────────────────

/**
 * Einfacher numerischer Score → TeacherHeuristicState.
 * 0 = blocked, 1 = match, 2 = attention, 3 = strong_attention.
 */
function scoreToState(score: 0 | 1 | 2 | 3): TeacherHeuristicState {
  if (score === 0) return 'blocked';
  if (score === 1) return 'heuristic_match';
  if (score === 2) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

/**
 * Pessimistisch kombiniert mehrere States.
 * 'blocked' gewinnt nur wenn ALLE blocked.
 * Sonst: schlechtester nicht-blocked State.
 */
function combineStates(states: TeacherHeuristicState[]): TeacherHeuristicState {
  const nonBlocked = states.filter(s => s !== 'blocked');
  if (nonBlocked.length === 0) return 'blocked';

  const order: TeacherHeuristicState[] = [
    'heuristic_match',
    'heuristic_attention',
    'heuristic_strong_attention',
  ];
  let worst = 0;
  for (const s of nonBlocked) {
    const idx = order.indexOf(s);
    if (idx > worst) worst = idx;
  }
  return order[worst];
}

// ─── EINZEL-HEURISTIKEN ─────────────────────────────────────────────────────

function computeSpine(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.spineTilt;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  // Vaganova: Rücken kerzengerade – > 5° Neigung auffällig, > 12° stark
  if (deg <= 5)  return 'heuristic_match';
  if (deg <= 12) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function computeShoulder(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.shoulderSymmetry;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  if (deg <= 3)  return 'heuristic_match';
  if (deg <= 8)  return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function computePelvis(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.pelvicTilt;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  if (deg <= 4)  return 'heuristic_match';
  if (deg <= 10) return 'heuristic_attention';
  return 'heuristic_strong_attention';
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

function computeArm(va: VaganovaFullAnalysis, side: 'L' | 'R'): TeacherHeuristicState {
  const m = side === 'L' ? va.armLineQualityL : va.armLineQualityR;
  if (!isEligible(m)) return 'blocked';
  // armLineQuality.value: Grad-Abweichung vom idealen Bogen
  const deg = Math.abs(m!.value);
  if (deg <= 8)  return 'heuristic_match';
  if (deg <= 20) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function computeLeg(va: VaganovaFullAnalysis, side: 'L' | 'R'): TeacherHeuristicState {
  const knee  = side === 'L' ? va.knieFlexionL  : va.knieFlexionR;
  const valgus = side === 'L' ? va.valgusDriftL  : va.valgusDriftR;

  const kEligible = isEligible(knee);
  const vEligible = isEligible(valgus);

  if (!kEligible && !vEligible) return 'blocked';

  let score: 0 | 1 | 2 | 3 = 0;

  if (kEligible && knee) {
    const kv = Math.abs(knee.value);
    // Gerades Standbein ≥ 165° oder Plié-Bereich 60–145°
    if (kv >= 165 || (kv >= 60 && kv <= 145)) score = Math.max(score, 1) as 0|1|2|3;
    else if (kv < 40) score = Math.max(score, 2) as 0|1|2|3;
  }

  if (vEligible && valgus) {
    const dv = Math.abs(valgus.value);
    if (dv < 5)       score = Math.max(score, 1) as 0|1|2|3;
    else if (dv < 10) score = Math.max(score, 2) as 0|1|2|3;
    else              score = Math.max(score, 3) as 0|1|2|3;
  }

  return scoreToState(score);
}

/**
 * projected_shin_foot_relation (früher SICKLE/WING).
 * Unvalidated teacher heuristic — braucht View+Visibility Gate.
 * Vorerst: nur dann nicht-blocked wenn Pose-Konfidenz ausreichend.
 */
function computeFoot(
  sk: ReconstructedSkeleton,
  side: 'L' | 'R'
): TeacherHeuristicState {
  const result = vaganovaFootAnalyzer.analyzeSickleWing(sk);
  const foot = side === 'L' ? result.left : result.right;

  if (!foot) return 'blocked';

  // Direktes Mapping: FootAnalyzer Status → TeacherHeuristicState
  // (FootAnalyzer-Gates prüfen bereits Landmark-Visibility)
  if (foot.type === 'NEUTRAL') {
    // Kein Sichel/Flügel sichtbar — aber NICHT automatisch heuristic_match
    // „Fehlen eines Fehlers ≠ positiver Befund"
    // Wir geben 'blocked' zurück solange kein positives Signal messbar ist
    return 'blocked';
  }
  if (foot.status === 'ERROR')   return 'heuristic_strong_attention';
  if (foot.status === 'WARNING') return 'heuristic_attention';
  return 'blocked';
}

/**
 * projected_torso_center_proxy (früher CoG / Gewichtsverteilung).
 * Nur gültig wenn beide Knöchel sichtbar und Geometrie valide.
 * KEIN automatisches Grün — Abwesenheit eines Fehlers ≠ positiver Befund.
 */
function computeCog(
  sk: ReconstructedSkeleton,
): TeacherHeuristicState {
  const w = vaganovaFootAnalyzer.analyzeWeightDistribution(sk, 0);

  // Fallback bei fehlenden Ankles: WeightDist gibt 'WARNING' mit label 'Zentriert'
  // Das ist irreführend — wir geben stattdessen 'blocked' zurück
  if (!sk.ankleL || !sk.ankleR) return 'blocked';

  if (w.status === 'ERROR')   return 'heuristic_strong_attention';
  if (w.status === 'WARNING') return 'heuristic_attention';
  // CORRECT — aber nur wenn Ankles da und Berechnung valide
  // Auch hier: erst mal 'blocked' bis wir echte Evidenz für heuristic_match haben
  // (40-60% Balance ist "nicht auffällig" – noch kein positives Vaganova-Signal)
  return 'blocked';
}

function computeHead(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.headTilt;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  if (deg <= 5)  return 'heuristic_match';
  if (deg <= 15) return 'heuristic_attention';
  return 'heuristic_strong_attention';
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
  ): TeacherOverlayPacket {
    if (!BUILD_POLICY.allowExperimentalTeacherTrafficLight || !va || !sk) {
      return createBlockedPacket(framePtsSeconds, streamEpoch);
    }

    return {
      torsoAlignment: computeTorsoAlignment(va),
      spine:     computeSpine(va),
      shoulder:  computeShoulder(va),
      pelvis:    computePelvis(va),
      armL:      computeArm(va, 'L'),
      armR:      computeArm(va, 'R'),
      legL:      computeLeg(va, 'L'),
      legR:      computeLeg(va, 'R'),
      footL:     computeFoot(sk, 'L'),
      footR:     computeFoot(sk, 'R'),
      cog:       computeCog(sk),
      head:      computeHead(va),
      policyVersion: BUILD_POLICY.policyVersion,
      streamEpoch,
      framePtsSeconds,
    };
  }
}

export const teacherHeuristicEngine = new TeacherHeuristicEngine();
