import { ReconstructedSkeleton, KinematicPoint } from './vaganova3DKinematics';
import { PoseLandmark } from './realMediaPipePose';

export type VaganovaArmPosition = 'PREPARATOIRE' | 'FIRST' | 'SECOND' | 'THIRD' | 'ALLONGE' | 'TRANSITION';
export type ArmQualityStatus = 'CORRECT' | 'WARNING' | 'ERROR';
export type EpaulementType = 'CROISE' | 'EFFACE' | 'ECARTE' | 'EN_FACE';

export interface ArmPositionResult {
  left: VaganovaArmPosition;
  right: VaganovaArmPosition;
  leftLabel: string;
  rightLabel: string;
}

export interface ElbowAnalysis {
  left: { angleDeg: number; heightStatus: ArmQualityStatus; roundnessStatus: ArmQualityStatus };
  right: { angleDeg: number; heightStatus: ArmQualityStatus; roundnessStatus: ArmQualityStatus };
}

export interface WristAnalysis {
  left: { deviationDeg: number; status: ArmQualityStatus };
  right: { deviationDeg: number; status: ArmQualityStatus };
}

export interface EpaulementResult {
  type: EpaulementType;
  label: string;
  shoulderAngleDeg: number;
  headTiltDeg: number;
}

class VaganovaArmAnalyzer {
  
  /**
   * Computes angle at point B formed by vectors BA and BC. Returns degrees.
   */
  private angle3P(a: KinematicPoint, b: KinematicPoint, c: KinematicPoint): number {
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const angleBA = Math.atan2(ba.y, ba.x);
    const angleBC = Math.atan2(bc.y, bc.x);
    let angle = angleBC - angleBA;
    if (angle < 0) {
      angle += 2 * Math.PI;
    }
    // Return smallest angle between vectors
    let angleDeg = angle * (180 / Math.PI);
    if (angleDeg > 180) {
      angleDeg = 360 - angleDeg;
    }
    return angleDeg;
  }

  /**
   * Computes angle between two 2D vectors using dot product. Returns degrees.
   */
  private angleBetweenVectors(v1: {x: number, y: number}, v2: {x: number, y: number}): number {
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const val = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(val) * (180 / Math.PI);
  }

  public classifyArmPosition(sk: ReconstructedSkeleton): ArmPositionResult {
    const pelvisCenter = {
      x: (sk.pelvisL.x + sk.pelvisR.x) / 2,
      y: (sk.pelvisL.y + sk.pelvisR.y) / 2
    };

    const classify = (shoulder: KinematicPoint, elbow: KinematicPoint, wrist: KinematicPoint): VaganovaArmPosition => {
      const elbowAngle = this.angle3P(shoulder, elbow, wrist);
      
      // Allongé: Arm nearly straight and extended away from body
      if (elbowAngle > 160 && Math.abs(wrist.x - sk.neck.x) > 80) {
        return 'ALLONGE';
      }

      // 3rd Position: Wrist above head level
      if (wrist.y < sk.head.y) {
        return 'THIRD';
      }

      // Préparatoire: Wrist below hip level
      if (wrist.y > pelvisCenter.y + 30) {
        return 'PREPARATOIRE';
      }

      // 1st Position: Wrists near navel/sternum height and close to body centerline
      if (wrist.y <= pelvisCenter.y && wrist.y >= sk.neck.y && Math.abs(wrist.x - sk.neck.x) <= 100) {
         return 'FIRST';
      }

      // 2nd Position: Wrists near shoulder height and far from centerline
      if (Math.abs(wrist.y - shoulder.y) <= 60 && Math.abs(wrist.x - sk.neck.x) > 120) {
         return 'SECOND';
      }

      // Default
      return 'TRANSITION';
    };

    const leftPos = classify(sk.shoulderL, sk.elbowL, sk.wristL);
    const rightPos = classify(sk.shoulderR, sk.elbowR, sk.wristR);

    const getLabel = (pos: VaganovaArmPosition): string => {
      switch(pos) {
        case 'PREPARATOIRE': return 'Préparatoire';
        case 'FIRST': return '1. Position';
        case 'SECOND': return '2. Position';
        case 'THIRD': return '3. Position';
        case 'ALLONGE': return 'Allongé';
        case 'TRANSITION': return 'Übergang';
      }
    };

    return {
      left: leftPos,
      right: rightPos,
      leftLabel: getLabel(leftPos),
      rightLabel: getLabel(rightPos)
    };
  }

  public analyzeElbowQuality(sk: ReconstructedSkeleton): ElbowAnalysis {
    const analyze = (shoulder: KinematicPoint, elbow: KinematicPoint, wrist: KinematicPoint) => {
      const angleDeg = this.angle3P(shoulder, elbow, wrist);
      
      let heightStatus: ArmQualityStatus = 'CORRECT';
      // elbow.y < shoulder.y - 15 means elbow is ABOVE shoulder by >15px (since y increases downward)
      if (elbow.y < shoulder.y - 15) {
        heightStatus = 'ERROR';
      } else if (elbow.y < shoulder.y) {
        heightStatus = 'WARNING';
      }

      let roundnessStatus: ArmQualityStatus = 'CORRECT';
      if (angleDeg >= 120 && angleDeg <= 150) {
        roundnessStatus = 'CORRECT';
      } else if ((angleDeg >= 100 && angleDeg < 120) || (angleDeg > 150 && angleDeg <= 165)) {
        roundnessStatus = 'WARNING';
      } else {
        roundnessStatus = 'ERROR';
      }

      return { angleDeg, heightStatus, roundnessStatus };
    };

    return {
      left: analyze(sk.shoulderL, sk.elbowL, sk.wristL),
      right: analyze(sk.shoulderR, sk.elbowR, sk.wristR)
    };
  }

  public analyzeWristAlignment(sk: ReconstructedSkeleton, landmarks?: PoseLandmark[]): WristAnalysis {
    const analyze = (
      elbow: KinematicPoint,
      wrist: KinematicPoint,
      indexPoint?: KinematicPoint | null,
      elbowIdx?: number,
      wristIdx?: number,
      indexIdx?: number
    ) => {
      let indexFinger: KinematicPoint | null = indexPoint || null;
      let ePt = elbow;
      let wPt = wrist;

      if (!indexFinger && landmarks && indexIdx !== undefined && landmarks[indexIdx]) {
        const lm = landmarks[indexIdx];
        indexFinger = { x: lm.x * 1000, y: lm.y * 1000, vis: lm.visibility ?? 1.0 };
      }
      if (landmarks && elbowIdx !== undefined && wristIdx !== undefined && landmarks[elbowIdx] && landmarks[wristIdx]) {
        const eLm = landmarks[elbowIdx];
        const wLm = landmarks[wristIdx];
        ePt = { x: eLm.x * 1000, y: eLm.y * 1000, vis: eLm.visibility ?? 1.0 };
        wPt = { x: wLm.x * 1000, y: wLm.y * 1000, vis: wLm.visibility ?? 1.0 };
      }

      let deviationDeg = 0;
      if (indexFinger) {
        // Genuine 3-point angle at wrist (Elbow=13/14, Wrist=15/16, Index=19/20)
        const angle = this.angle3P(ePt, wPt, indexFinger);
        // A straight hand continuation is 180°. Deviation is absolute angle offset from 180°
        deviationDeg = Math.round(Math.abs(180 - angle) * 10) / 10;
      }

      let status: ArmQualityStatus = 'CORRECT';
      
      if (deviationDeg >= 10 && deviationDeg <= 25) {
        status = 'WARNING';
      } else if (deviationDeg > 25) {
        status = 'ERROR';
      }
      
      return { deviationDeg, status };
    };

    return {
      left: analyze(sk.elbowL, sk.wristL, sk.indexL, 13, 15, 19),
      right: analyze(sk.elbowR, sk.wristR, sk.indexR, 14, 16, 20)
    };
  }

  public analyzeEpaulement(sk: ReconstructedSkeleton): EpaulementResult {
    const dx = sk.shoulderR.x - sk.shoulderL.x;
    const dy = sk.shoulderR.y - sk.shoulderL.y;
    const shoulderAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

    // Vector from neck to head
    const neckToHead = { x: sk.head.x - sk.neck.x, y: sk.head.y - sk.neck.y };
    // Vertical reference vector (pointing up, which is negative y in screen coordinates)
    const headTiltDeg = this.angleBetweenVectors(neckToHead, {x: 0, y: -1});

    const shoulderSpread = Math.abs(dx);
    const hipSpread = Math.abs(sk.pelvisR.x - sk.pelvisL.x);
    const ratio = hipSpread > 0 ? shoulderSpread / hipSpread : 1;

    let type: EpaulementType;
    let label: string;

    if (ratio < 0.6) {
      // Narrow shoulder spread relative to hips indicates body is turned
      if (Math.abs(headTiltDeg) > 5) { // Simplistic heuristic using head tilt direction
        type = 'CROISE';
        label = 'Croisé';
      } else {
        type = 'EFFACE';
        label = 'Effacé';
      }
    } else {
      // Wide spread indicates body is more open to front
      if (Math.abs(headTiltDeg) > 10) { 
        type = 'ECARTE';
        label = 'Écarté';
      } else {
        type = 'EN_FACE';
        label = 'En Face';
      }
    }

    return {
      type,
      label,
      shoulderAngleDeg,
      headTiltDeg
    };
  }
}

export const vaganovaArmAnalyzer = new VaganovaArmAnalyzer();
