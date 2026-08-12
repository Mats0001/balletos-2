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
import { ReconstructedSkeleton } from './vaganova3DKinematics';
import {
  TeacherHeuristicState,
  TeacherOverlayPacket,
  createBlockedPacket,
} from '../types/teacherHeuristic';
import { BUILD_POLICY, NEUTRAL_MEASUREMENT_CLASSES } from '../config/buildPolicy';

// Debug throttle for torso alignment logging (TEMPORÄR)
let _torsoLastLog = 0;

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
  m: { measurement_class: string; confidence: number; value: number } | null | undefined,
  minConfidence = 0.35
): boolean {
  if (!m) return false;
  if (!Number.isFinite(m.value) || !Number.isFinite(m.confidence)) return false;
  if (m.confidence < 0 || m.confidence > 1) return false;
  if (NEUTRAL_MEASUREMENT_CLASSES.has(m.measurement_class as any)) return false;
  if (m.measurement_class === 'validated_system_threshold') return false;
  if (m.confidence < minConfidence) return false;
  return true;
}

// ─── HEURISTIK-RESOLVER ─────────────────────────────────────────────────────

/**
 * Pessimistisch kombiniert mehrere States.
 * Jede fehlende Teilmessung blockiert den zusammengesetzten Befund.
 */
function combineStates(states: TeacherHeuristicState[]): TeacherHeuristicState {
  if (states.some(s => s === 'blocked')) return 'blocked';

  // Pessimistisch: Der schlechteste nicht-blockierte Zustand gewinnt.
  // Begründung: Wenn EIN Bereich Aufmerksamkeit braucht, soll der
  // gesamte Torso-Rahmen das signalisieren — nicht durch Mehrheit verwässern.
  if (states.some(s => s === 'heuristic_strong_attention')) return 'heuristic_strong_attention';
  if (states.some(s => s === 'heuristic_attention')) return 'heuristic_attention';
  return 'heuristic_match';
}

// ─── EINZEL-HEURISTIKEN ─────────────────────────────────────────────────────

function computeSpine(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.spineTilt;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  // Mit isotropischer vw/vh-Korrektur: Rauschboden ~1-2°.
  // Vaganova-Standard: Wirbelsäule lotrecht, Abweichung >4° ist sichtbar.
  if (deg <= 4)  return 'heuristic_match';
  if (deg <= 10) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function computeShoulder(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.shoulderSymmetry;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  // Schulter-Symmetrie: Nicole sieht Asymmetrie ab ~3°.
  // Épaulement kann 3-5° erzeugen, darüber ist es Haltungsfehler.
  if (deg <= 5)  return 'heuristic_match';
  if (deg <= 12) return 'heuristic_attention';
  return 'heuristic_strong_attention';
}

function computePelvis(va: VaganovaFullAnalysis): TeacherHeuristicState {
  const m = va.pelvicTilt;
  if (!isEligible(m)) return 'blocked';
  const deg = Math.abs(m!.value);
  // Becken-Neigung: Vaganova verlangt neutrales Becken.
  // >5° sichtbare Neigung, >12° deutlicher Fehler.
  if (deg <= 5)  return 'heuristic_match';
  if (deg <= 12) return 'heuristic_attention';
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
  const result = combineStates([spine, shoulder, pelvis]);

  // 🔍 DEBUG: Echte Winkelwerte + Einzelergebnisse (TEMPORÄR, entfernen nach Diagnose)
  const spineVal = va.spineTilt ? Math.abs(va.spineTilt.value).toFixed(1) : 'N/A';
  const shoulderVal = va.shoulderSymmetry ? Math.abs(va.shoulderSymmetry.value).toFixed(1) : 'N/A';
  const pelvisVal = va.pelvicTilt ? Math.abs(va.pelvicTilt.value).toFixed(1) : 'N/A';
  
  // Nur alle 2 Sekunden loggen um Konsole nicht zu fluten
  const now = Date.now();
  if (now - _torsoLastLog > 2000) {
    _torsoLastLog = now;
    console.log(
      `🔍 TORSO: spine=${spineVal}° (${spine}) | shoulder=${shoulderVal}° (${shoulder}) | pelvis=${pelvisVal}° (${pelvis}) → COMBINED: ${result}`
    );
  }

  return result;
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

function computeLeg(_va: VaganovaFullAnalysis, _side: 'L' | 'R'): TeacherHeuristicState {
  // The only current inputs are research_observation (knee flexion) and an
  // directionally ambiguous individual_baseline delta. Both are display/shadow metrics and
  // explicitly have no scoring authority. A context-aware DecisionGate must
  // authorize a future leg color; until then the teacher overlay stays neutral.
  return 'blocked';
}

/**
 * projected_shin_foot_relation (früher SICKLE/WING).
 * Unvalidated teacher heuristic — braucht View+Visibility Gate.
 * Vorerst: nur dann nicht-blocked wenn Pose-Konfidenz ausreichend.
 */
function computeFoot(
  _sk: ReconstructedSkeleton,
  _side: 'L' | 'R'
): TeacherHeuristicState {
  // A 2D shin/foot cross-product changes meaning with camera view and mirror
  // state. Until both are explicit evidence, it has no traffic-light authority.
  return 'blocked';
}

/**
 * projected_torso_center_proxy (früher CoG / Gewichtsverteilung).
 * Nur gültig wenn beide Knöchel sichtbar und Geometrie valide.
 * KEIN automatisches Grün — Abwesenheit eines Fehlers ≠ positiver Befund.
 */
function computeCog(
  _sk: ReconstructedSkeleton,
): TeacherHeuristicState {
  // Single-camera pose does not measure pressure or center of pressure. Keep
  // this display proxy neutral until a dedicated evidence contract exists.
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
