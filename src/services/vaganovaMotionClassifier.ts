import { PoseLandmark } from './realMediaPipePose';

export interface MotionClassificationResult {
  detectedPoseName: string;       // e.g. "Profil-Haltung (1. Position Port de Bras)"
  detectedPerspective: 'FRONTAL' | 'PROFILE_RIGHT' | 'PROFILE_LEFT';
  confidence: number;            // 0..100%
  spineAlignmentScore: number;   // 0..100%
  isPlie: boolean;
  isArabesque: boolean;
  isProfile: boolean;
}

export class VaganovaMotionClassifierService {
  /**
   * Automatically classify motion pose and camera perspective from MediaPipe 33-point keypoints
   * without requiring manual setup from Nicole!
   */
  public classify(landmarks: PoseLandmark[] | null): MotionClassificationResult {
    if (!landmarks || landmarks.length < 33) {
      return {
        detectedPoseName: 'Automatische KI-Erkennung initialisiert...',
        detectedPerspective: 'FRONTAL',
        confidence: 0,
        spineAlignmentScore: 0,
        isPlie: false,
        isArabesque: false,
        isProfile: false
      };
    }

    const sL = landmarks[11];
    const sR = landmarks[12];
    const hL = landmarks[23];
    const hR = landmarks[24];
    const kL = landmarks[25];
    const kR = landmarks[26];
    const aL = landmarks[27];
    const aR = landmarks[28];

    // 1. Perspective Classification: Shoulder & Hip width ratio
    const shoulderWidth = Math.abs(sL.x - sR.x);
    const hipWidth = Math.abs(hL.x - hR.x);

    // If shoulder width in screen space is narrow (< 0.14), dancer is facing PROFILE (side view)
    const isProfile = shoulderWidth < 0.14 || hipWidth < 0.12;
    
    // Determine profile direction (facing left or right)
    const nose = landmarks[0];
    const isFacingRight = nose ? (nose.x > (sL.x + sR.x) / 2) : true;
    const perspective: 'FRONTAL' | 'PROFILE_RIGHT' | 'PROFILE_LEFT' = !isProfile
      ? 'FRONTAL'
      : isFacingRight ? 'PROFILE_RIGHT' : 'PROFILE_LEFT';

    // 2. Knee Bend Calculation (Plié detection)
    const computeKneeAngle = (hip: PoseLandmark, knee: PoseLandmark, ankle: PoseLandmark) => {
      const v1x = hip.x - knee.x;
      const v1y = hip.y - knee.y;
      const v2x = ankle.x - knee.x;
      const v2y = ankle.y - knee.y;
      const dot = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
      const rad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
      return (rad * 180) / Math.PI;
    };

    const angleKneeL = computeKneeAngle(hL, kL, aL);
    const angleKneeR = computeKneeAngle(hR, kR, aR);
    const isPlie = angleKneeL < 145 || angleKneeR < 145;

    // 3. Arabesque Detection (One leg raised high)
    const legHeightL = Math.abs(aL.y - hL.y);
    const legHeightR = Math.abs(aR.y - hR.y);
    const isArabesque = aL.y < hL.y || aR.y < hR.y || legHeightL < 0.2 || legHeightR < 0.2;

    // 4. Determine Named Vaganova Pose
    let detectedPoseName = 'Aufrechte Grundhaltung (1. Position)';

    if (isProfile) {
      if (isPlie) {
        detectedPoseName = 'Profil Plié & Oberkörper-Lothaltung';
      } else if (isArabesque) {
        detectedPoseName = 'Profil Arabesque / Attitude Linienführung';
      } else {
        detectedPoseName = 'Profil-Haltung (Port de Bras 1. Position)';
      }
    } else {
      if (isPlie) {
        detectedPoseName = 'Frontal Grand Plié (2. Position)';
      } else if (isArabesque) {
        detectedPoseName = 'Frontal Arabesque Alignment';
      } else {
        detectedPoseName = 'Frontal Vaganova Vorbereitung';
      }
    }

    // Calculate genuine confidence from average landmark visibility
    const totalVis = landmarks.reduce((sum, lm) => sum + (lm.visibility ?? 1.0), 0);
    const avgVis = landmarks.length > 0 ? totalVis / landmarks.length : 0;
    const confidence = Math.round(avgVis * 100 * 10) / 10;

    // Calculate genuine spine alignment score based on torso vertical deviation
    const shMid = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
    const hipMid = { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 };
    const dx = Math.abs(shMid.x - hipMid.x);
    const dy = Math.abs(shMid.y - hipMid.y);
    const spineTiltDeg = dy > 0 ? Math.atan2(dx, dy) * (180 / Math.PI) : 0;
    const spineAlignmentScore = Math.max(0, Math.min(100, Math.round((100 - spineTiltDeg * 2) * 10) / 10));

    return {
      detectedPoseName,
      detectedPerspective: perspective,
      confidence,
      spineAlignmentScore,
      isPlie,
      isArabesque,
      isProfile
    };
  }
}

export const vaganovaMotionClassifier = new VaganovaMotionClassifierService();
