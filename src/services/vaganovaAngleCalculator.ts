import { PoseLandmark } from './realMediaPipePose';

export interface VaganovaMeasurement {
  value: number;       // The measured value in degrees (or unitless for ratios)
  unit: 'deg' | 'ratio' | 'px';
  confidence: number;  // 0-1, based on landmark visibility
  label: string;       // Human-readable German label
  // Vaganova-conformant classification
  status?: 'CORRECT' | 'WARNING' | 'ERROR';
  norm?: string;       // Human-readable norm description
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
    // Valgus rule: knee must track over mid-foot; pronation = ERROR
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

  // ── VALGUS DRIFT / KNIE-ALIGNMENT ─────────────────────────────────────────
  // Source: Clinical biomechanics; FPPA (Frontal Plane Projection Angle)
  valgus: {
    correct: 5,   // <5° FPPA deviation = CORRECT
    warning: 10,  // 5–10° = WARNING
    // >10° = ERROR
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
  valgusDriftL: VaganovaMeasurement | null;
  valgusDriftR: VaganovaMeasurement | null;
  turnoutL: VaganovaMeasurement | null;
  turnoutR: VaganovaMeasurement | null;
  spineTilt: VaganovaMeasurement | null;
  epaulement: VaganovaMeasurement | null;
  portDeBrasL: VaganovaMeasurement | null;
  portDeBrasR: VaganovaMeasurement | null;
  pelvicTilt: VaganovaMeasurement | null;
  shoulderSymmetry: VaganovaMeasurement | null;
  shoulderElevationL: VaganovaMeasurement | null;  // NEW: Hochziehen left
  shoulderElevationR: VaganovaMeasurement | null;  // NEW: Hochziehen right
  armLineQualityL: VaganovaMeasurement | null;     // NEW: Port de Bras quality L
  armLineQualityR: VaganovaMeasurement | null;     // NEW: Port de Bras quality R
  headTilt: VaganovaMeasurement | null;
  plumbDeviation: VaganovaMeasurement | null;
}

export class VaganovaAngleCalculator {
  // Base Math Functions (private)
  private angle3P(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
    let angle = Math.abs((Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)) * (180 / Math.PI));
    if (angle > 180) {
      angle = 360 - angle;
    }
    return angle; // normalized to 0-180
  }

  private angleTilt(top: { x: number; y: number }, bottom: { x: number; y: number }): number {
    // Measures deviation from vertical (0° = perfectly vertical, 90° = horizontal)
    // atan2(dx, dy) gives angle from Y-axis (vertical)
    return Math.abs(Math.atan2(bottom.x - top.x, bottom.y - top.y) * (180 / Math.PI));
  }

  private distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }

  private midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private getConfidence(landmarks: PoseLandmark[], indices: number[]): number {
    let minVis = 1;
    for (const i of indices) {
      const lm = landmarks[i];
      if (!lm || lm.visibility === undefined) return 0;
      minVis = Math.min(minVis, lm.visibility);
    }
    return minVis;
  }

  public calcKneeFlexion(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [hipIdx, kneeIdx, ankleIdx] = side === 'L' ? [23, 25, 27] : [24, 26, 28];
    const conf = this.getConfidence(landmarks, [hipIdx, kneeIdx, ankleIdx]);
    if (conf < 0.3) return null;

    const angle = this.angle3P(landmarks[hipIdx], landmarks[kneeIdx], landmarks[ankleIdx]);
    // Standing leg: 165–180° = straight = CORRECT
    // Demi plié: 60–90°, Grand plié: 125–145° (NIH: 134.98° ± 4.62°)
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle >= VAGANOVA_NORMS.plie.standingLegMin ? 'CORRECT' :
      angle >= VAGANOVA_NORMS.plie.grand.kneeFlexionMin ? 'WARNING' : 'ERROR';
    return {
      value: angle, unit: 'deg', confidence: conf,
      label: `Knieflexion ${side === 'L' ? 'links' : 'rechts'}`,
      status,
      norm: `Vaganova: Stand ≥165° = korrekt, Grand Plié 125–145° (NIH: 134.98° ± 4.62°)`
    };
  }

  public calcValgusDrift(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [hipIdx, kneeIdx, ankleIdx] = side === 'L' ? [23, 25, 27] : [24, 26, 28];
    const conf = this.getConfidence(landmarks, [hipIdx, kneeIdx, ankleIdx]);
    if (conf < 0.3) return null;

    const hip = landmarks[hipIdx];
    const knee = landmarks[kneeIdx];
    const ankle = landmarks[ankleIdx];

    // TRUE Frontal Plane Projection Angle (FPPA):
    // Measures how far the knee deviates MEDIALLY/LATERALLY from
    // the straight line between hip and ankle.
    // This is the angle of the knee's perpendicular offset from the hip→ankle axis.
    //
    // Method: Project knee onto hip→ankle vector, measure the lateral offset angle.
    // A perfectly aligned knee gives 0°.
    // Valgus (inward collapse) gives positive degrees.

    const hx = hip.x, hy = hip.y;
    const ax = ankle.x, ay = ankle.y;
    const kx = knee.x, ky = knee.y;

    // Vector from hip to ankle
    const haX = ax - hx;
    const haY = ay - hy;
    const haLen = Math.sqrt(haX * haX + haY * haY);
    if (haLen < 0.001) return null;

    // Vector from hip to knee
    const hkX = kx - hx;
    const hkY = ky - hy;

    // Perpendicular distance of knee from hip→ankle line
    // Cross product gives signed distance
    const crossProduct = haX * hkY - haY * hkX;
    const perpDist = crossProduct / haLen;

    // Convert to angle: atan2(perpendicular_offset, parallel_projection)
    const dotProduct = haX * hkX + haY * hkY;
    const parallelDist = dotProduct / haLen;

    const driftAngle = Math.abs(Math.atan2(perpDist, parallelDist) * (180 / Math.PI));

    const { correct, warning } = VAGANOVA_NORMS.valgus;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      driftAngle <= correct ? 'CORRECT' :
      driftAngle <= warning ? 'WARNING' : 'ERROR';

    return {
      value: driftAngle, unit: 'deg', confidence: conf,
      label: `Valgus-Drift ${side === 'L' ? 'links' : 'rechts'}`,
      status,
      norm: `Vaganova FPPA: <${correct}° = korrekt, ${correct}–${warning}° = Warnung, >${warning}° = Fehler`
    };
  }

  public calcTurnout(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [heelIdx, toeIdx, ankleIdx] = side === 'L' ? [29, 31, 27] : [30, 32, 28];
    const { minAcceptable, maxSafe } = VAGANOVA_NORMS.turnout;

    const classify = (footAngle: number, conf: number): VaganovaMeasurement => {
      const status: 'CORRECT' | 'WARNING' | 'ERROR' =
        footAngle >= minAcceptable && footAngle <= maxSafe ? 'CORRECT' :
        footAngle >= 30 ? 'WARNING' : 'ERROR';
      return {
        value: footAngle, unit: 'deg', confidence: conf,
        label: `Turnout ${side === 'L' ? 'links' : 'rechts'}`,
        status,
        norm: `Vaganova En Dehors: ${minAcceptable}–${maxSafe}° = korrekt (Hüfte, nicht Knie)
             Beginner: 60–70°, Intermediate: 70–80°, Advanced: 80–90°`
      };
    };

    const heelConf = this.getConfidence(landmarks, [heelIdx, toeIdx]);
    if (heelConf >= 0.3) {
      const heel = landmarks[heelIdx];
      const toe = landmarks[toeIdx];
      const footAngle = Math.abs(Math.atan2(toe.x - heel.x, toe.y - heel.y) * (180 / Math.PI));
      return classify(footAngle, heelConf);
    }

    const ankleConf = this.getConfidence(landmarks, [ankleIdx, toeIdx]);
    if (ankleConf >= 0.3) {
      const ankle = landmarks[ankleIdx];
      const toe = landmarks[toeIdx];
      const footAngle = Math.abs(Math.atan2(toe.x - ankle.x, toe.y - ankle.y) * (180 / Math.PI));
      return classify(footAngle, ankleConf * 0.8);
    }

    return null;
  }

  public calcSpineTilt(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [11, 12, 23, 24]);
    if (conf < 0.3) return null;

    const shMid = this.midpoint(landmarks[11], landmarks[12]);
    const hipMid = this.midpoint(landmarks[23], landmarks[24]);
    const angle = this.angleTilt(shMid, hipMid);

    const { correctDeg, warningDeg } = VAGANOVA_NORMS.spine;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= correctDeg ? 'CORRECT' :
      angle <= warningDeg ? 'WARNING' : 'ERROR';

    return {
      value: angle, unit: 'deg', confidence: conf,
      label: 'Aplomb (Rumpfneigung)', status,
      norm: `Vaganova Aplomb: ≤2° = korrekt, 2–5° = akzeptabel, >5° = Fehler`
    };
  }

  public calcEpaulement(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    // Épaulement = head rotation (yaw) relative to shoulder axis
    // In 2D, head yaw is estimated from the asymmetry of nose-to-ear distances.
    // When the head turns right, dist(nose, rightEar) decreases while dist(nose, leftEar) increases.
    const conf = this.getConfidence(landmarks, [0, 7, 8, 11, 12]);
    if (conf < 0.3) return null;

    const nose = landmarks[0];
    const earL = landmarks[7];
    const earR = landmarks[8];

    const distL = this.distance2D(nose, earL);
    const distR = this.distance2D(nose, earR);

    // Avoid division by zero
    if (distL + distR < 0.001) return null;

    // ratio > 1 = head turned right, ratio < 1 = head turned left
    const ratio = distL / distR;
    // Convert to approximate degrees: atan of the normalized asymmetry
    const epaulementDeg = Math.abs(Math.atan2(ratio - 1, ratio + 1)) * (180 / Math.PI) * 4; // scaling factor ~4 maps ratio to degrees

    return {
      value: epaulementDeg,
      unit: 'deg',
      confidence: conf,
      label: 'Épaulement'
    };
  }

  public calcPortDeBras(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [shIdx, elIdx, wrIdx] = side === 'L' ? [11, 13, 15] : [12, 14, 16];
    const conf = this.getConfidence(landmarks, [shIdx, elIdx, wrIdx]);
    if (conf < 0.3) return null;

    const angle = this.angle3P(landmarks[shIdx], landmarks[elIdx], landmarks[wrIdx]);
    return {
      value: angle,
      unit: 'deg',
      confidence: conf,
      label: `Port de Bras ${side === 'L' ? 'links' : 'rechts'}`
    };
  }

  public calcPelvicTilt(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [23, 24]);
    if (conf < 0.3) return null;

    const dx = landmarks[24].x - landmarks[23].x;
    const dy = landmarks[24].y - landmarks[23].y;
    let angle = Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI);
    if (angle > 90) angle = 180 - angle;

    // Vaganova: Becken neutral = CORRECT (source: vaganova_norms.json pelvis)
    const { neutralTiltMax, warningTiltMax } = VAGANOVA_NORMS.pelvis;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= neutralTiltMax ? 'CORRECT' : angle <= warningTiltMax ? 'WARNING' : 'ERROR';

    return {
      value: angle, unit: 'deg', confidence: conf,
      label: 'Beckenneigung', status,
      norm: `Vaganova: Becken neutral ≤3° = korrekt, 3–6° = Warnung, >6° = Fehler`
    };
  }

  /**
   * Schulter-Horizontalität (Vaganova-konform)
   * Misst die Neigung der Schulterlinie in Grad.
   * CORRECT: ≤2°, WARNING: 2–5°, ERROR: >5°
   * Ausnahme: Bei Épaulement ist Asymmetrie gewollt (wird extern berücksichtigt).
   */
  public calcShoulderSymmetry(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [11, 12]);
    if (conf < 0.3) return null;

    const shL = landmarks[11];
    const shR = landmarks[12];

    // Shoulder line tilt: angle from horizontal (0° = perfectly level)
    const dx = shR.x - shL.x;
    const dy = shR.y - shL.y;
    const angleDeg = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    // angleDeg near 0° = level shoulders, near 90° = extreme tilt

    const { symmetryDegCorrect, symmetryDegWarning } = VAGANOVA_NORMS.shoulder;
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angleDeg <= symmetryDegCorrect ? 'CORRECT' :
      angleDeg <= symmetryDegWarning ? 'WARNING' : 'ERROR';

    return {
      value: angleDeg,
      unit: 'deg',
      confidence: conf,
      label: 'Schulter-Horizontalität',
      status,
      norm: `Vaganova: ≤${symmetryDegCorrect}° = korrekt, ${symmetryDegCorrect}–${symmetryDegWarning}° = Warnung, >${symmetryDegWarning}° = Fehler`
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
      value: Math.round(normalizedDist * 1000) / 10, // convert to %-of-frame for readability
      unit: 'ratio',
      confidence: conf,
      label: `Schulter-Elevation ${side === 'L' ? 'links' : 'rechts'}`,
      status,
      norm: 'Vaganova: Schultern entspannt nach unten, nicht zu den Ohren hochziehen'
    };
  }

  /**
   * Arm-Linie Qualität – Port de Bras (Vaganova-konform)
   * Misst den Ellbogen-Winkel (Schulter → Ellbogen → Handgelenk).
   * Zusätzlich: Prüft ob Ellbogen unter Schulterhöhe liegt.
   * CORRECT: 145–170°, WARNING: 130–145° / 170–175°, ERROR: außerhalb
   */
  public calcArmLineQuality(landmarks: PoseLandmark[], side: 'L' | 'R'): VaganovaMeasurement | null {
    const [shIdx, elIdx, wrIdx] = side === 'L' ? [11, 13, 15] : [12, 14, 16];
    const conf = this.getConfidence(landmarks, [shIdx, elIdx, wrIdx]);
    if (conf < 0.3) return null;

    const shoulder = landmarks[shIdx];
    const elbow = landmarks[elIdx];
    const wrist = landmarks[wrIdx];

    // Elbow arc angle
    const elbowAngle = this.angle3P(shoulder, elbow, wrist);

    // Check elbow height relative to shoulder
    // In image coords: elbow.y > shoulder.y means elbow is BELOW shoulder (correct)
    const elbowBelowShoulder = elbow.y - shoulder.y; // positive = below = OK

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
      label: `Arm-Linie ${side === 'L' ? 'links' : 'rechts'}`,
      status,
      norm: `Vaganova Port de Bras: ${elbowAngleMin}–${elbowAngleMax}° = korrekt, Ellbogen leicht unter Schulter`
    };
  }

  public calcHeadTilt(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [7, 8, 11, 12]);
    if (conf < 0.3) return null;

    const earMid = this.midpoint(landmarks[7], landmarks[8]);
    const shMid = this.midpoint(landmarks[11], landmarks[12]);
    const angle = this.angleTilt(earMid, shMid);

    // Vaganova: Kopf aufrecht ≤2°, leichte Neigung 2–5° (Épaulement), starke Neigung >5° = Fehler
    const status: 'CORRECT' | 'WARNING' | 'ERROR' =
      angle <= 2 ? 'CORRECT' : angle <= 5 ? 'WARNING' : 'ERROR';

    return {
      value: angle,
      unit: 'deg',
      confidence: conf,
      label: 'Kopfneigung',
      status,
      norm: 'Vaganova: Kopf aufrecht ≤2° = korrekt, 2–5° = Épaulement akzeptabel, >5° = Fehler'
    };
  }

  public calcPlumbDeviation(landmarks: PoseLandmark[]): VaganovaMeasurement | null {
    const conf = this.getConfidence(landmarks, [23, 24, 27, 28]);
    if (conf < 0.3) return null;

    const hipMid = this.midpoint(landmarks[23], landmarks[24]);
    const ankleMid = this.midpoint(landmarks[27], landmarks[28]);
    const dx = Math.abs(hipMid.x - ankleMid.x);

    return {
      value: dx,
      unit: 'px',
      confidence: conf,
      label: 'Lotabweichung'
    };
  }

  public analyzeFullFrame(landmarks: PoseLandmark[]): VaganovaFullAnalysis {
    return {
      knieFlexionL: this.calcKneeFlexion(landmarks, 'L'),
      knieFlexionR: this.calcKneeFlexion(landmarks, 'R'),
      valgusDriftL: this.calcValgusDrift(landmarks, 'L'),
      valgusDriftR: this.calcValgusDrift(landmarks, 'R'),
      turnoutL: this.calcTurnout(landmarks, 'L'),
      turnoutR: this.calcTurnout(landmarks, 'R'),
      spineTilt: this.calcSpineTilt(landmarks),
      epaulement: this.calcEpaulement(landmarks),
      portDeBrasL: this.calcPortDeBras(landmarks, 'L'),
      portDeBrasR: this.calcPortDeBras(landmarks, 'R'),
      pelvicTilt: this.calcPelvicTilt(landmarks),
      shoulderSymmetry: this.calcShoulderSymmetry(landmarks),
      shoulderElevationL: this.calcShoulderElevation(landmarks, 'L'),
      shoulderElevationR: this.calcShoulderElevation(landmarks, 'R'),
      armLineQualityL: this.calcArmLineQuality(landmarks, 'L'),
      armLineQualityR: this.calcArmLineQuality(landmarks, 'R'),
      headTilt: this.calcHeadTilt(landmarks),
      plumbDeviation: this.calcPlumbDeviation(landmarks)
    };
  }
}

export const vaganovaAngleCalculator = new VaganovaAngleCalculator();
