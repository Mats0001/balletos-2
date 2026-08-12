import { PoseLandmark } from './realMediaPipePose';

/**
 * Epistemological class for every measurement output.
 * Prevents research_observation or pedagogical_nominal_angle values
 * from being used as health/error thresholds.
 *
 * Sources:
 *   - Asaeda et al. 2024 (18.83–19.68° discrepancy in its single-leg
 *     drop-landing setup; not a universal ballet/Plié error model)
 *   - IADMS Turnout Resource Paper 2025
 *   - Gorwa et al. 2020 (PLoS ONE)
 *   - ISB Joint Coordinate System (Wu et al. 2002)
 */
export type MeasurementClass =
  | 'vaganova_relation'          // Relational technique rule – often boolean or directional
  | 'pedagogical_nominal_angle'  // Vaganova spatial height (45°/90°), NOT anatomical joint angle
  | 'research_observation'       // Group mean from study – NEVER use as individual threshold
  | 'validated_system_threshold' // Only after Mocap/Vicon validation protocol
  | 'not_measurable';            // Cannot be reliably measured with current sensor setup

export interface MeasurableVaganovaMeasurement {
  value: number;                     // The measured value
  unit: 'deg' | 'ratio' | 'px' | 'delta_deg' | 'boolean_proxy';
  confidence: number;                // 0–1, based on landmark visibility
  label: string;                     // Human-readable German label
  measurement_class: Exclude<MeasurementClass, 'not_measurable'>;
  status?: 'CORRECT' | 'WARNING' | 'ERROR';
  norm?: string;                     // Human-readable norm description with source
  source_page?: string;              // e.g. "Vaganova 6th ed. p.47"
}

export interface UnavailableVaganovaMeasurement {
  measurement_class: 'not_measurable';
  confidence: number;
  label: string;
  value?: never;
  unit?: never;
  status?: never;
  not_measurable_reason: string;
  required_sensor?: string;
}

export type VaganovaMeasurement = MeasurableVaganovaMeasurement | UnavailableVaganovaMeasurement;

export function isMeasurableVaganovaMeasurement(
  measurement: VaganovaMeasurement | null | undefined
): measurement is MeasurableVaganovaMeasurement {
  return measurement?.measurement_class !== undefined
    && measurement.measurement_class !== 'not_measurable';
}

// ─────────────────────────────────────────────────────────────────────────────
// VAGANOVA NORMS v2.0 – Verified scientific sources:
//   NIH/PubMed (peer-reviewed kinematics), JOSPT, Polimi biomechanics,
//   Vaganova pedagogy (Wikipedia, balletartsandfitness.com),
//   theballetdoctor.com, chiropractic.on.ca
// Source file: /Users/mats/.gemini/antigravity/scratch/vaganova_norms.json
// ─────────────────────────────────────────────────────────────────────────────
export const VAGANOVA_NORMS = {

  // ── SCORING TOLERANCES (universal deviation bands) ────────────────────────
  // Source: scoring_tolerances in vaganova_norms.json
  scoring: {
    excellent: 5,       // 0–5°  deviation = Ausgezeichnet
    good: 10,           // 5–10° deviation = Gut
    acceptable: 15,     // 10–15° deviation = Akzeptabel
    needsCorrection: 25 // 15–25° deviation = Korrektur nötig; >25° = Fehler
  },

  // ── TURNOUT / EN DEHORS ───────────────────────────────────────────────────
  // Source: NIH/PubMed, JOSPT, chiropractic.on.ca
  // Hip contributes 60–65% of total 180° turnout
  turnout: {
    ideal: 90,          // Hip external rotation ideal (60–65% of 180°)
    beginner:  { min: 60, max: 70 },    // functional turnout 120–140° total → ~60–70° each foot from hip
    intermediate: { min: 70, max: 80 },
    advanced: { min: 80, max: 90 },
    minAcceptable: 45,  // below this = ERROR regardless of level
    maxSafe: 120,       // beyond this angle → compensated at knee, not hip
    // Knee-foot relation requires Nicole-confirmed context; it is not scored here.
  },

  // ── PLIÉ ─────────────────────────────────────────────────────────────────
  // Source: NIH/PubMed – Grand Plié: 134.98° ± 4.62° knee flexion
  plie: {
    demi: {
      kneeFlexionMin: 60,   // demi plié: 60–90° knee flexion
      kneeFlexionMax: 90,
    },
    grand: {
      kneeFlexionMean: 135, // NIH measured: 134.98° ± 4.62°
      kneeFlexionMin: 125,
      kneeFlexionMax: 145,
      internalRotationMean: 30, // 30.28° ± 6.16° – biomechanically unavoidable
    },
    // For straight standing leg: 165–180° = CORRECT
    standingLegMin: 165,
  },

  // ── ARABESQUE ─────────────────────────────────────────────────────────────
  // Source: Wikipedia/Vaganova, NIH/PubMed
  arabesque: {
    vaganovaStandard: 110, // Vaganova standard leg height
    beginner: { min: 45, max: 60 },
    intermediate: { min: 60, max: 90 },
    advanced: { min: 90, max: 110 },
    // Anterior pelvic tilt tolerance (>45° leg height)
    pelvisTiltMax: 15,
    spineCompensationMax: 25, // thoracic extension limit
  },

  // ── PORT DE BRAS / ARM POSITIONS ──────────────────────────────────────────
  // Source: Vaganova pedagogy, balletartsandfitness.com
  arm: {
    // Shoulder→Elbow→Wrist arc angle (our primary 2D measurement)
    // 2nd position: shoulder abduction 80–95°, elbow flexion 10–20°
    // → maps to angle3P ≈ 155–170°
    elbowAngleMin: 145,     // CORRECT lower bound
    elbowAngleMax: 175,     // CORRECT upper bound (was 170; 2nd pos allows nearly straight)
    elbowAngleWarnMin: 130, // WARNING lower bound
    elbowAngleWarnMax: 178, // WARNING upper bound
    elbowAboveShoulderWarn: 0.02, // normalized; positive = elbow BELOW shoulder (correct)
    // Port de Bras positions (shoulder abduction/flexion angles):
    prep:  { shoulderFlexMin: 10, shoulderFlexMax: 20, elbowFlexMin: 20, elbowFlexMax: 35 },
    first: { shoulderFlexMin: 40, shoulderFlexMax: 60, elbowFlexMin: 25, elbowFlexMax: 40 },
    second: { shoulderAbdMin: 80, shoulderAbdMax: 95, elbowFlexMin: 10, elbowFlexMax: 20 },
    third: { shoulderFlexMin: 155, shoulderFlexMax: 175, elbowFlexMin: 20, elbowFlexMax: 35 },
  },

  // ── SHOULDER / ÉPAULEMENT ─────────────────────────────────────────────────
  // Source: Vaganova pedagogy, dancespirit.com
  shoulder: {
    // Shoulder line horizontal alignment
    symmetryDegCorrect: 2,  // ≤2° = CORRECT
    symmetryDegWarning: 5,  // 2–5° = WARNING
    // >5° = ERROR (unless épaulement position with intentional croisé/effacé)
    // Shoulder elevation (Hochziehen = pulling up toward ears)
    elevationThresholdWarn: 0.03,   // normalized Y-gap shoulder→ear
    elevationThresholdError: 0.05,
    // Épaulement torso rotation (croisé/effacé): 10–25° from waist
    epaulementTorsoMin: 10,
    epaulementTorsoMax: 25,
    // Head rotation in épaulement: 15–30° (croisé), 10–25° (effacé)
    headRotationMin: 10,
    headRotationMax: 30,
    // Head tilt: 0–10° acceptable (Vaganova prefers rotation over tilt)
    headTiltMax: 10,
  },

  // ── SPINE / APLOMB ─────────────────────────────────────────────────────────
  // Source: Vaganova pedagogy; neutral spine standards
  spine: {
    correctDeg: 2,  // ≤2° from vertical = CORRECT (aplomb)
    warningDeg: 5,  // 2–5° = WARNING (acceptable lean)
    // >5° = ERROR
    // Neutral standing curves (reference, not directly measured in 2D):
    cervicalLordosis: { min: 20, max: 40 },
    thoracicKyphosis: { min: 20, max: 45 },
    lumbarLordosis: { min: 20, max: 45 },
  },

  // ── PELVIS ─────────────────────────────────────────────────────────────────
  pelvis: {
    neutralTiltMax: 3,  // ≤3° = CORRECT (neutral)
    warningTiltMax: 6,  // 3–6° = WARNING
    // >6° = ERROR
    // During arabesque: anterior tilt 5–15° allowed
    arabesqueTiltMax: 15,
  },

  // ── ATTITUDE ───────────────────────────────────────────────────────────────
  // Source: Britannica, theballetacademy.com.sg
  attitude: {
    kneeFlexionIdeal: 90,
    kneeFlexionMin: 70,
    kneeFlexionMax: 110,
    // Rule: knee MUST be higher than foot; internal rotation = ERROR
  },

  // ── RETIRÉ / PASSÉ ─────────────────────────────────────────────────────────
  // Source: NIH/PubMed, ResearchGate
  retire: {
    kneeFlexionMin: 120,
    kneeFlexionMax: 145,
    hipAbductionMin: 30,
    hipAbductionMax: 60,
    pelvisHikeTolerance: 3, // max 3° pelvis hike
  },

  // ── JUMPS ──────────────────────────────────────────────────────────────────
  // Source: essex.ac.uk, NIH/PubMed
  jumps: {
    takeoffKneeFlexMin: 60,  // demi plié before jump: 60–90°
    takeoffKneeFlexMax: 90,
    landingKneeFlexMin: 60,  // landing absorption: 60–90°
    landingKneeFlexMax: 90,
  },
};

export interface VaganovaFullAnalysis {
  knieFlexionL: VaganovaMeasurement | null;
  knieFlexionR: VaganovaMeasurement | null;
  valgusDriftL: UnavailableVaganovaMeasurement | null;
  valgusDriftR: UnavailableVaganovaMeasurement | null;
  turnoutL: VaganovaMeasurement | null;
  turnoutR: VaganovaMeasurement | null;
  spineTilt: VaganovaMeasurement | null;
  epaulement: VaganovaMeasurement | null;
  portDeBrasL: VaganovaMeasurement | null;
  portDeBrasR: VaganovaMeasurement | null;
  pelvicTilt: VaganovaMeasurement | null;
  shoulderSymmetry: VaganovaMeasurement | null;
  shoulderElevationL: VaganovaMeasurement | null;
  shoulderElevationR: VaganovaMeasurement | null;
  armLineQualityL: VaganovaMeasurement | null;
  armLineQualityR: VaganovaMeasurement | null;
  headTilt: VaganovaMeasurement | null;
  plumbDeviation: VaganovaMeasurement | null;
}

export class VaganovaAngleCalculator {
  private static _lastIsoWarn = 0;
  private static readonly GEOMETRY_EPSILON_PX = 0.000_001;

  // Base Math Functions (private)
  // ─────────────────────────────────────────────────────────────────────────
  // IMPORTANT: All methods below require vw (videoWidth) and vh (videoHeight).
  // Normalized landmark coords (x: 0..1, y: 0..1) MUST be multiplied by vw/vh
  // before any angle or distance calculation.
  // For 960x1280: without scaling, a true 45° can appear as 36.9° or 53.1°.
  // Audit finding P0 (external advisor + internal audit, 2026-08-10)
  // ─────────────────────────────────────────────────────────────────────────

  private angle3P(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    vw: number,
    vh: number
  ): number | null {
    if (![a.x, a.y, b.x, b.y, c.x, c.y, vw, vh].every(Number.isFinite)) return null;
    if (vw <= 0 || vh <= 0) return null;
    // Convert to pixel space before computing angle
    const ax = a.x * vw, ay = a.y * vh;
    const bx = b.x * vw, by = b.y * vh;
    const cx = c.x * vw, cy = c.y * vh;
    const firstLength = Math.hypot(ax - bx, ay - by);
    const secondLength = Math.hypot(cx - bx, cy - by);
    if (
      firstLength <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
      || secondLength <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
    ) return null;
    let angle = Math.abs(
      (Math.atan2(cy - by, cx - bx) - Math.atan2(ay - by, ax - bx)) * (180 / Math.PI)
    );
    if (angle > 180) angle = 360 - angle;
    return Number.isFinite(angle) ? angle : null; // normalized to 0-180
  }

  private angleTilt(
    top: { x: number; y: number },
    bottom: { x: number; y: number },
    vw: number,
    vh: number
  ): number | null {
    if (![top.x, top.y, bottom.x, bottom.y, vw, vh].every(Number.isFinite)) return null;
    if (vw <= 0 || vh <= 0) return null;
    // Measures deviation from vertical (0° = perfectly vertical)
    // Convert to pixel space before atan2
    const tx = top.x * vw,    ty = top.y * vh;
    const bx = bottom.x * vw, by = bottom.y * vh;
    if (Math.hypot(bx - tx, by - ty) <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX) {
      return null;
    }
    const angle = Math.abs(Math.atan2(bx - tx, by - ty) * (180 / Math.PI));
    return Number.isFinite(angle) ? angle : null;
  }

  private distance2D(
    a: { x: number; y: number },
    b: { x: number; y: number },
    vw: number,
    vh: number
  ): number | null {
    if (![a.x, a.y, b.x, b.y, vw, vh].every(Number.isFinite)) return null;
    if (vw <= 0 || vh <= 0) return null;
    // Returns distance in pixels (isotropic)
    const dx = (b.x - a.x) * vw;
    const dy = (b.y - a.y) * vh;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Number.isFinite(distance) ? distance : null;
  }

  private midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private getConfidence(landmarks: PoseLandmark[], indices: number[]): number {
    let minVis = 1;
    for (const i of indices) {
      const lm = landmarks[i];
      if (
        !lm
        || !Number.isFinite(lm.x)
        || !Number.isFinite(lm.y)
        || lm.visibility === undefined
        || !Number.isFinite(lm.visibility)
        || lm.visibility < 0
        || lm.visibility > 1
      ) return 0;
      minVis = Math.min(minVis, lm.visibility);
    }
    return minVis;
  }

  public calcKneeFlexion(landmarks: PoseLandmark[], side: 'L' | 'R', vw = 1, vh = 1): VaganovaMeasurement | null {
    const [hipIdx, kneeIdx, ankleIdx] = side === 'L' ? [23, 25, 27] : [24, 26, 28];
    const conf = this.getConfidence(landmarks, [hipIdx, kneeIdx, ankleIdx]);
    if (conf < 0.3) return null;

    const angle = this.angle3P(landmarks[hipIdx], landmarks[kneeIdx], landmarks[ankleIdx], vw, vh);
    if (angle === null) return null;
    // P0-a FIX (Berater 2026-08-10): research_observation darf KEINE CORRECT/WARNING/ERROR erzeugen.
    // Ein Studienmittelwert (Fotaki: 134.98° ± 4.62°) ist KEIN Sollwert für Einzelpersonen.
    // DOI-Fix P0-e: 10.1371/journal.pone.0230654 ist Gorwa (Turnout), NICHT Plié.
    // Fotaki et al. Grand Plié: DOI 10.3390/sports12020054, PMID 38393275
    return {
      value: angle, unit: 'deg', confidence: conf,
      measurement_class: 'research_observation',
      label: `Knieflexion ${side === 'L' ? 'links' : 'rechts'}`,
      // status: deliberately omitted – research_observation must never produce a scoring verdict
      norm: 'Beobachtungswert (Studienmittelwert). Fotaki et al. 2024: Grand Plié ~134.98° ±4.62°. Kein individueller Sollwert.',
      source_page: 'Fotaki et al. 2024, DOI: 10.3390/sports12020054, PMID: 38393275'
    };
  }

  /**
   * Computes an unsigned 2D knee-axis projection for internal observability.
   *
   * This is deliberately NOT a valgus measurement or a session baseline. The
   * current single-camera contract has no Nicole-confirmed reference frame,
   * view/mirror identity, or movement-phase anchor. Therefore the value must
   * remain not_measurable and must never carry a status, target, direction, or
   * traffic-light authority.
   */
  public calcValgusDrift(landmarks: PoseLandmark[], side: 'L' | 'R', vw = 1, vh = 1): UnavailableVaganovaMeasurement | null {
    const [hipIdx, kneeIdx, ankleIdx] = side === 'L' ? [23, 25, 27] : [24, 26, 28];
    const conf = this.getConfidence(landmarks, [hipIdx, kneeIdx, ankleIdx]);
    if (conf < 0.3) return null;

    const hip = landmarks[hipIdx];
    const knee = landmarks[kneeIdx];
    const ankle = landmarks[ankleIdx];

    // Pixel-space 2D projection. Scaling corrects display aspect-ratio
    // distortion, but does not turn the proxy into an anatomical joint angle.
    const hx = hip.x * vw,   hy = hip.y * vh;
    const ax = ankle.x * vw, ay = ankle.y * vh;
    const kx = knee.x * vw,  ky = knee.y * vh;

    const haX = ax - hx, haY = ay - hy;
    const haLen = Math.sqrt(haX * haX + haY * haY);
    const hkLen = Math.hypot(kx - hx, ky - hy);
    const kaLen = Math.hypot(ax - kx, ay - ky);
    if (
      haLen < 0.001
      || hkLen <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
      || kaLen <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
    ) return null;

    const hkX = kx - hx, hkY = ky - hy;
    const crossProduct = haX * hkY - haY * hkX;
    const perpDist = crossProduct / haLen;
    const dotProduct = haX * hkX + haY * hkY;
    const parallelDist = dotProduct / haLen;
    const rawAngle = Math.abs(Math.atan2(perpDist, parallelDist) * (180 / Math.PI));
    if (!Number.isFinite(rawAngle)) return null;

    return {
      confidence: conf,
      measurement_class: 'not_measurable',
      label: `Projizierte Knieachsengeometrie ${side === 'L' ? 'links' : 'rechts'} (nicht bewertet)`,
      not_measurable_reason: 'Kein gültiger Referenzanker: Perspektive, Spiegelung und Bewegungsphase sind nicht bestätigt.',
      required_sensor: 'Nicole-bestätigter Referenzframe mit dokumentierter Perspektive, Spiegelung und Bewegungsphase; für biomechanische Winkel ein kalibriertes Referenzsystem'
    };
  }

  public calcTurnout(landmarks: PoseLandmark[], side: 'L' | 'R', vw = 1, vh = 1): VaganovaMeasurement | null {
    const [heelIdx, toeIdx, ankleIdx] = side === 'L' ? [29, 31, 27] : [30, 32, 28];

    const classify = (footAngle: number, conf: number): VaganovaMeasurement => {
      // P0-b FIX (Berater 2026-08-10): pedagogical_nominal_angle darf KEINE Fehlerfarben erzeugen.
      // Die 25°/40°-Grenzen sind nicht durch Vaganova oder Studiendaten belegt.
      // IADMS 2025: 180° ist Linienideal (keine Vorgabe für Individuen).
      // status: deliberately omitted – scorePolicy muss 'display_only' sein.
      return {
        value: footAngle, unit: 'deg', confidence: conf,
        measurement_class: 'pedagogical_nominal_angle',
        label: `Turnout ${side === 'L' ? 'links' : 'rechts'} (Fußwinkel-Proxy)`,
        // status: omitted – pedagogical_nominal_angle = display_only, no threshold scoring
        norm: 'Fußwinkel-Proxy (nicht Hüftaußenrotation!). Anzeigewert – kein Pass/Fail. IADMS 2025: 180° ist Linienideal.',
        source_page: 'IADMS Turnout Resource Paper 2025; Gorwa et al. 2020 PLoS ONE DOI 10.1371/journal.pone.0230654'
      };
    };

    const heelConf = this.getConfidence(landmarks, [heelIdx, toeIdx]);
    if (heelConf >= 0.3) {
      const heel = landmarks[heelIdx];
      const toe = landmarks[toeIdx];
      const heelDx = (toe.x - heel.x) * vw;
      const heelDy = (toe.y - heel.y) * vh;
      // P0 FIX: pixel-space atan2
      if (Math.hypot(heelDx, heelDy) > VaganovaAngleCalculator.GEOMETRY_EPSILON_PX) {
        const footAngle = Math.abs(Math.atan2(heelDx, heelDy) * (180 / Math.PI));
        if (Number.isFinite(footAngle)) return classify(footAngle, heelConf);
      }
    }

    const ankleConf = this.getConfidence(landmarks, [ankleIdx, toeIdx]);
    if (ankleConf >= 0.3) {
      const ankle = landmarks[ankleIdx];
      const toe = landmarks[toeIdx];
      const ankleDx = (toe.x - ankle.x) * vw;
      const ankleDy = (toe.y - ankle.y) * vh;
      if (Math.hypot(ankleDx, ankleDy) <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX) {
        return null;
      }
      // P0 FIX: pixel-space atan2
      const footAngle = Math.abs(Math.atan2(ankleDx, ankleDy) * (180 / Math.PI));
      return Number.isFinite(footAngle) ? classify(footAngle, ankleConf * 0.8) : null;
    }

    return null;
  }

  public calcSpineTilt(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [11, 12, 23, 24]);
    if (conf < 0.3) return null;

    const shMid = this.midpoint(landmarks[11], landmarks[12]);
    const hipMid = this.midpoint(landmarks[23], landmarks[24]);
    const angle = this.angleTilt(shMid, hipMid, vw, vh);
    if (angle === null) return null;

    const { correctDeg, warningDeg } = VAGANOVA_NORMS.spine;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= correctDeg ? 'CORRECT' :
      angle <= warningDeg ? 'WARNING' : 'ERROR';

    return {
      value: angle, unit: 'deg', confidence: conf,
      measurement_class: 'vaganova_relation',
      label: 'Aplomb (Rumpfneigung)', status,
      norm: 'Vaganova: Körperblöcke senkrecht gestapelt. Bildprojektion – kein ISB-Gelenkwinkel.',
      source_page: 'Vaganova, Основы, 6th ed. p.12; ISB Wu et al. 2002'
    };
  }

  public calcEpaulement(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaMeasurement | null {
    // Épaulement = head rotation (yaw) relative to shoulder axis
    // In 2D, head yaw is estimated from the asymmetry of nose-to-ear distances.
    // P0 FIX: Use pixel-space distance2D (aspect-ratio-aware)
    const conf = this.getConfidence(landmarks, [0, 7, 8, 11, 12]);
    if (conf < 0.3) return null;

    const nose = landmarks[0];
    const earL = landmarks[7];
    const earR = landmarks[8];

    const distL = this.distance2D(nose, earL, vw, vh);
    const distR = this.distance2D(nose, earR, vw, vh);

    if (
      distL === null
      || distR === null
      || distL < 0.001
      || distR < 0.001
    ) return null;

    const ratio = distL / distR;
    // ratio > 1 = head turned right, ratio < 1 = head turned left
    // atan2-based approximation maps asymmetry ratio → approximate degrees
    const epaulementDeg = Math.abs(Math.atan2(ratio - 1, ratio + 1)) * (180 / Math.PI) * 4;

    return {
      value: epaulementDeg,
      unit: 'deg',
      confidence: conf,
      measurement_class: 'vaganova_relation',
      label: 'Épaulement (Kopfrotations-Proxy)',
      norm: 'Épaulement ist relational (Bühne, Becken, Schulter, Kopf, Blick). Kein Gradnormwert. Vaganova 6th ed.',
      source_page: 'Vaganova, Основы, 6th ed.; kein Grad-Sollwert'
    };
  }

  public calcPortDeBras(landmarks: PoseLandmark[], side: 'L' | 'R', vw = 1, vh = 1): VaganovaMeasurement | null {
    const [shIdx, elIdx, wrIdx] = side === 'L' ? [11, 13, 15] : [12, 14, 16];
    const conf = this.getConfidence(landmarks, [shIdx, elIdx, wrIdx]);
    if (conf < 0.3) return null;

    const angle = this.angle3P(landmarks[shIdx], landmarks[elIdx], landmarks[wrIdx], vw, vh);
    if (angle === null) return null;
    return {
      value: angle,
      unit: 'deg',
      confidence: conf,
      measurement_class: 'vaganova_relation',
      label: `Port de Bras ${side === 'L' ? 'links' : 'rechts'} (Ellbogen-Winkel)`,
      norm: 'Arm-Linie Proxy. Kein universeller Schulterwinkel für 2. Pos. (Vaganova).'
    };
  }

  public calcPelvicTilt(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [23, 24]);
    if (conf < 0.3) return null;

    // P0 FIX: pixel-space dx/dy before atan2
    const dx = (landmarks[24].x - landmarks[23].x) * vw;
    const dy = (landmarks[24].y - landmarks[23].y) * vh;
    if (
      !Number.isFinite(dx)
      || !Number.isFinite(dy)
      || Math.hypot(dx, dy) <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
    ) return null;
    let angle = Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI);
    if (angle > 90) angle = 180 - angle;

    const { neutralTiltMax, warningTiltMax } = VAGANOVA_NORMS.pelvis;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= neutralTiltMax ? 'CORRECT' : angle <= warningTiltMax ? 'WARNING' : 'ERROR';

    return {
      value: angle, unit: 'deg', confidence: conf,
      measurement_class: 'vaganova_relation',
      label: 'Beckenneigung', status,
      norm: 'Vaganova: Becken neutral. Bildprojektion (coronal). Kein ISB-Beckenwinkel.',
      source_page: 'Vaganova, Основы, 6th ed.'
    };
  }

  /**
   * Schulter-Horizontalität (Vaganova-konform)
   * Misst die Neigung der Schulterlinie in Grad.
   * CORRECT: ≤2°, WARNING: 2–5°, ERROR: >5°
   * Ausnahme: Bei Épaulement ist Asymmetrie gewollt (wird extern berücksichtigt).
   */
  public calcShoulderSymmetry(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [11, 12]);
    if (conf < 0.3) return null;

    const shL = landmarks[11];
    const shR = landmarks[12];

    // P0 FIX: pixel-space dx/dy before atan2
    const dx = (shR.x - shL.x) * vw;
    const dy = (shR.y - shL.y) * vh;
    if (
      !Number.isFinite(dx)
      || !Number.isFinite(dy)
      || Math.hypot(dx, dy) <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
    ) return null;
    // atan2(dy, dx) gibt den Winkel zur X-Achse (Horizontalen) zurück.
    // Bei horizontaler Linie: ~0° oder ~±180° (je nach dx-Vorzeichen).
    // Wir wollen die ABWEICHUNG von der Horizontalen (0-90°).
    const rawAngle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 bis +180
    // Normalisieren: 0° und ±180° sind beide horizontal → Abweichung = 0°
    const angleDeg = Math.abs(rawAngle) > 90
      ? 180 - Math.abs(rawAngle)  // Winkel nahe ±180° → kleine Abweichung
      : Math.abs(rawAngle);        // Winkel nahe 0° → kleine Abweichung

    const { symmetryDegCorrect, symmetryDegWarning } = VAGANOVA_NORMS.shoulder;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angleDeg <= symmetryDegCorrect ? 'CORRECT' :
      angleDeg <= symmetryDegWarning ? 'WARNING' : 'ERROR';

    return {
      value: angleDeg,
      unit: 'deg',
      confidence: conf,
      measurement_class: 'vaganova_relation',
      label: 'Schulter-Horizontalität',
      status,
      norm: 'Vaganova: Schulterachse horizontal. Ausnahme: Épaulement (gewollte Asymmetrie).',
      source_page: 'Vaganova, Основы, 6th ed.'
    };
  }

  /**
   * Schulter-Elevation (Hochziehen)
   * Vaganova: Schultern müssen nach unten entspannt sein, NICHT Richtung Ohren.
   * Messung: Normierter Y-Abstand zwischen Schulter (LM11/12) und Ohr (LM7/8).
   * Kleiner Abstand = Schulter hochgezogen.
   */
  public calcShoulderElevation(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [shIdx, earIdx] = side === 'L' ? [11, 7] : [12, 8];
    const conf = this.getConfidence(landmarks, [shIdx, earIdx]);
    if (conf < 0.3) return null;

    const shoulder = landmarks[shIdx];
    const ear = landmarks[earIdx];
    const shoulderEarDistance = this.distance2D(shoulder, ear, 1, 1);
    if (
      shoulderEarDistance === null
      || shoulderEarDistance <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX
    ) return null;

    // In image coords: Y increases downward.
    // Shoulder BELOW ear = normal (shoulder.y > ear.y)
    // Normalized distance: smaller value = shoulder closer to ear = elevated
    const normalizedDist = shoulder.y - ear.y; // positive = correct (shoulder below ear)

    const { elevationThresholdWarn, elevationThresholdError } = VAGANOVA_NORMS.shoulder;
    // Elevated when distance is too small (shoulder.y close to ear.y)
    const elevated = normalizedDist; // positive = good gap, near 0 or negative = elevated
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      elevated >= elevationThresholdWarn ? 'CORRECT' :
      elevated >= -elevationThresholdError ? 'WARNING' : 'ERROR';

    return {
      value: Math.round(normalizedDist * 1000) / 10,
      unit: 'ratio',
      confidence: conf,
      measurement_class: 'vaganova_relation',
      label: `Schulter-Elevation ${side === 'L' ? 'links' : 'rechts'}`,
      status,
      norm: 'Vaganova: Schultern entspannt nach unten, nicht zu den Ohren hochziehen.',
      source_page: 'Vaganova, Основы, 6th ed.'
    };
  }

  /**
   * Arm-Linie Qualität – Port de Bras (Vaganova-konform)
   * Misst den Ellbogen-Winkel (Schulter → Ellbogen → Handgelenk).
   * Zusätzlich: Prüft ob Ellbogen unter Schulterhöhe liegt.
   * CORRECT: 145–170°, WARNING: 130–145° / 170–175°, ERROR: außerhalb
   */
  public calcArmLineQuality(landmarks: PoseLandmark[], side: 'L' | 'R', vw = 1, vh = 1): VaganovaMeasurement | null {
    const [shIdx, elIdx, wrIdx] = side === 'L' ? [11, 13, 15] : [12, 14, 16];
    const conf = this.getConfidence(landmarks, [shIdx, elIdx, wrIdx]);
    if (conf < 0.3) return null;

    const shoulder = landmarks[shIdx];
    const elbow = landmarks[elIdx];
    const wrist = landmarks[wrIdx];

    const elbowAngle = this.angle3P(shoulder, elbow, wrist, vw, vh);
    if (elbowAngle === null) return null;

    // Elbow height relative to shoulder (normalized y is fine for this comparison)
    const elbowBelowShoulder = elbow.y - shoulder.y;

    const { elbowAngleMin, elbowAngleMax, elbowAngleWarnMin, elbowAngleWarnMax, elbowAboveShoulderWarn } = VAGANOVA_NORMS.arm;

    let status: 'CORRECT' | 'WARNING' | 'ERROR';
    if (elbowAngle >= elbowAngleMin && elbowAngle <= elbowAngleMax && elbowBelowShoulder >= -elbowAboveShoulderWarn) {
      status = 'CORRECT';
    } else if (elbowAngle >= elbowAngleWarnMin && elbowAngle <= elbowAngleWarnMax) {
      status = 'WARNING';
    } else {
      status = 'ERROR';
    }

    return {
      value: elbowAngle,
      unit: 'deg',
      confidence: conf,
      // Berater 2026-08-10: proxy_unvalidated ist ein Validierungszustand, keine Wissensklasse.
      // Der 'as any'-Cast verhindert Compile-time-Sicherheit und wurde entfernt.
      // Semantische Basis: Vaganova-Relation (Quelle: Основы, 6th ed.)
      // Validierungsstatus: unvalidiert (kein Mocap-Protokoll abgeschlossen)
      // TODO Sprint 1 Step 4: In MetricEpistemics.validationStatus migrieren:
      //   { semanticBasis: 'vaganova_relation', validationStatus: 'unvalidated',
      //     scorePolicy: 'no_score' } – kein Status bis Mocap-Freigabe
      measurement_class: 'vaganova_relation',
      label: `Arm-Linie ${side === 'L' ? 'links' : 'rechts'} (Port de Bras)`,
      status,
      norm: `Vaganova Port de Bras: ${elbowAngleMin}–${elbowAngleMax}°. Quelle: Vaganova Основы 6th ed. Validierungsstatus: unvalidiert (Mocap-Protokoll ausstehend).`,
      source_page: 'Vaganova, Основы, 6th ed. | candidate_unvalidated_threshold | Sprint 1: MetricEpistemics.validationStatus pending'
    };
  }

  public calcHeadTilt(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [7, 8, 11, 12]);
    if (conf < 0.3) return null;

    const earMid = this.midpoint(landmarks[7], landmarks[8]);
    const shMid = this.midpoint(landmarks[11], landmarks[12]);
    const angle = this.angleTilt(earMid, shMid, vw, vh);
    if (angle === null) return null;

    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= 2 ? 'CORRECT' : angle <= 5 ? 'WARNING' : 'ERROR';

    return {
      value: angle,
      unit: 'deg',
      confidence: conf,
      measurement_class: 'vaganova_relation',
      label: 'Kopfneigung',
      status,
      norm: 'Vaganova: Kopf aufrecht. Épaulement: leichte Neigung akzeptabel. Kein Gradnormwert.',
      source_page: 'Vaganova, Основы, 6th ed.'
    };
  }

  public calcPlumbDeviation(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [23, 24, 27, 28]);
    if (conf < 0.3) return null;

    const hipMid = this.midpoint(landmarks[23], landmarks[24]);
    const ankleMid = this.midpoint(landmarks[27], landmarks[28]);
    const axisLength = this.distance2D(hipMid, ankleMid, 1, 1);
    if (axisLength === null || axisLength <= VaganovaAngleCalculator.GEOMETRY_EPSILON_PX) {
      return null;
    }
    return {
      confidence: conf,
      measurement_class: 'not_measurable',
      label: 'Lotabweichung',
      not_measurable_reason: 'Rohe Pixeleinheit ohne Kalibrierung. Kein metrischer Abstand bestimmbar.',
      required_sensor: 'Kalibrierte Kamera mit bekannter Brennweite und Bodenebene'
    };
  }

  public analyzeFullFrame(landmarks: PoseLandmark[], vw = 1, vh = 1): VaganovaFullAnalysis {
    // P0 FIX (2026-08-10): vw/vh (videoWidth/videoHeight) MUST be passed.
    // Default 1/1 is safe but produces non-isotropic angles.
    // Callers should always pass video.videoWidth and video.videoHeight.
    if (vw === 1 && vh === 1 && Date.now() - VaganovaAngleCalculator._lastIsoWarn > 10000) {
      VaganovaAngleCalculator._lastIsoWarn = Date.now();
      console.warn('[VaganovaAngleCalculator] analyzeFullFrame called without vw/vh – angles will be non-isotropic!');
    }
    return {
      knieFlexionL: this.calcKneeFlexion(landmarks, 'L', vw, vh),
      knieFlexionR: this.calcKneeFlexion(landmarks, 'R', vw, vh),
      valgusDriftL: this.calcValgusDrift(landmarks, 'L', vw, vh),
      valgusDriftR: this.calcValgusDrift(landmarks, 'R', vw, vh),
      turnoutL: this.calcTurnout(landmarks, 'L', vw, vh),
      turnoutR: this.calcTurnout(landmarks, 'R', vw, vh),
      spineTilt: this.calcSpineTilt(landmarks, vw, vh),
      epaulement: this.calcEpaulement(landmarks, vw, vh),
      portDeBrasL: this.calcPortDeBras(landmarks, 'L', vw, vh),
      portDeBrasR: this.calcPortDeBras(landmarks, 'R', vw, vh),
      pelvicTilt: this.calcPelvicTilt(landmarks, vw, vh),
      shoulderSymmetry: this.calcShoulderSymmetry(landmarks, vw, vh),
      shoulderElevationL: this.calcShoulderElevation(landmarks, 'L'),  // ratio-based, no vw/vh needed
      shoulderElevationR: this.calcShoulderElevation(landmarks, 'R'),  // ratio-based, no vw/vh needed
      armLineQualityL: this.calcArmLineQuality(landmarks, 'L', vw, vh),
      armLineQualityR: this.calcArmLineQuality(landmarks, 'R', vw, vh),
      headTilt: this.calcHeadTilt(landmarks, vw, vh),
      plumbDeviation: this.calcPlumbDeviation(landmarks)               // not_measurable anyway
    };
  }
}

export const vaganovaAngleCalculator = new VaganovaAngleCalculator();
