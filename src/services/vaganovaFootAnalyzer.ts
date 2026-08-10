import { ReconstructedSkeleton, KinematicPoint } from './vaganova3DKinematics';

export type FootAlignmentType = 'NEUTRAL' | 'SICKLE' | 'WING';
export type FootQualityStatus = 'CORRECT' | 'WARNING' | 'ERROR';

export interface SickleWingResult {
  left: { type: FootAlignmentType; angleDeg: number; status: FootQualityStatus } | null;
  right: { type: FootAlignmentType; angleDeg: number; status: FootQualityStatus } | null;
}

export interface PointeResult {
  left: { extensionDeg: number; status: FootQualityStatus } | null;
  right: { extensionDeg: number; status: FootQualityStatus } | null;
}

export interface WeightDistributionResult {
  balancePercent: number; // 0 = all left, 50 = centered, 100 = all right
  status: FootQualityStatus;
  label: string; // German: 'Zentriert', 'Links-lastig', 'Rechts-lastig'
}

class VaganovaFootAnalyzer {
  private angle3P(a: KinematicPoint, b: KinematicPoint, c: KinematicPoint): number {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  }

  private calculateSickleWing(
    knee: KinematicPoint,
    ankle: KinematicPoint,
    foot: KinematicPoint,
    isLeft: boolean
  ): { type: FootAlignmentType; angleDeg: number; status: FootQualityStatus } {
    const shinVec = { x: ankle.x - knee.x, y: ankle.y - knee.y };
    const footVec = { x: foot.x - ankle.x, y: foot.y - ankle.y };
    
    const crossProduct = shinVec.x * footVec.y - shinVec.y * footVec.x;
    const dot = shinVec.x * footVec.x + shinVec.y * footVec.y;
    const magShin = Math.sqrt(shinVec.x * shinVec.x + shinVec.y * shinVec.y);
    const magFoot = Math.sqrt(footVec.x * footVec.x + footVec.y * footVec.y);
    
    let deviation = 0;
    if (magShin > 0 && magFoot > 0) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (magShin * magFoot)));
      deviation = (Math.acos(cosTheta) * 180) / Math.PI;
    }
    
    // Inward vs outward based on cross product and side
    // For left foot (from viewer's perspective, left side of body is on right side of image if facing camera)
    // We'll simplify and use a general cross product heuristic:
    const isSickle = isLeft ? crossProduct < 0 : crossProduct > 0;
    
    let type: FootAlignmentType = 'NEUTRAL';
    let status: FootQualityStatus = 'CORRECT';
    
    if (deviation >= 8) {
      type = isSickle ? 'SICKLE' : 'WING';
      status = deviation > 15 ? 'ERROR' : 'WARNING';
    } else {
      type = 'NEUTRAL';
      status = 'CORRECT';
    }
    
    return { type, angleDeg: deviation, status };
  }

  public analyzeSickleWing(sk: ReconstructedSkeleton): SickleWingResult {
    let left = null;
    let right = null;

    if (sk.footL && sk.ankleL && sk.kneeL && sk.footL.vis >= 0.3) {
      left = this.calculateSickleWing(sk.kneeL, sk.ankleL, sk.footL, true);
    }
    if (sk.footR && sk.ankleR && sk.kneeR && sk.footR.vis >= 0.3) {
      right = this.calculateSickleWing(sk.kneeR, sk.ankleR, sk.footR, false);
    }

    return { left, right };
  }

  public analyzePointe(sk: ReconstructedSkeleton): PointeResult {
    let left = null;
    let right = null;

    if (sk.footL && sk.ankleL && sk.kneeL && sk.footL.vis >= 0.3) {
      const extensionDeg = this.angle3P(sk.kneeL, sk.ankleL, sk.footL);
      let status: FootQualityStatus = 'ERROR';
      if (extensionDeg > 160) status = 'CORRECT';
      else if (extensionDeg >= 140) status = 'WARNING';
      
      left = { extensionDeg, status };
    }
    if (sk.footR && sk.ankleR && sk.kneeR && sk.footR.vis >= 0.3) {
      const extensionDeg = this.angle3P(sk.kneeR, sk.ankleR, sk.footR);
      let status: FootQualityStatus = 'ERROR';
      if (extensionDeg > 160) status = 'CORRECT';
      else if (extensionDeg >= 140) status = 'WARNING';
      
      right = { extensionDeg, status };
    }

    return { left, right };
  }

  public analyzeWeightDistribution(sk: ReconstructedSkeleton, cogX: number): WeightDistributionResult {
    if (!sk.ankleL || !sk.ankleR) {
      return { balancePercent: 50, status: 'WARNING', label: 'Zentriert' };
    }

    const minX = Math.min(sk.ankleL.x, sk.ankleR.x);
    const maxX = Math.max(sk.ankleL.x, sk.ankleR.x);
    const width = maxX - minX;

    let balancePercent = 50;
    if (width > 0) {
      balancePercent = ((cogX - minX) / width) * 100;
      balancePercent = Math.max(0, Math.min(100, balancePercent));
    }

    let status: FootQualityStatus = 'ERROR';
    let label = '';

    if (balancePercent >= 40 && balancePercent <= 60) {
      status = 'CORRECT';
      label = 'Zentriert';
    } else if ((balancePercent >= 25 && balancePercent < 40) || (balancePercent > 60 && balancePercent <= 75)) {
      status = 'WARNING';
      label = balancePercent < 40 ? 'Links-lastig' : 'Rechts-lastig';
    } else {
      status = 'ERROR';
      label = balancePercent < 25 ? 'Links-lastig' : 'Rechts-lastig';
    }

    return { balancePercent, status, label };
  }
}

export const vaganovaFootAnalyzer = new VaganovaFootAnalyzer();
