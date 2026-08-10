// ─────────────────────────────────────────────────────────────────────────────
// vaganova3DKinematics.ts  –  2D DISPLAY SKELETON (NOT 3D)
//
// ⚠️  AUDIT FINDING (2026-08-10): Despite the name, this module performs
//     NO true 3D reconstruction. It uses 2D normalized landmarks only.
//     The `_landmarks3D` / `worldLandmarks` parameter is accepted but
//     intentionally unused (underscore prefix). The `z` field on KinematicPoint
//     is populated from MediaPipe's hip-relative depth estimate, NOT from
//     calibrated world-space 3D coordinates.
//
//     HARDCODED FALLBACKS assume a 1000×1000 px frame. At other resolutions
//     (e.g. 1920×1080) missing-landmark fallbacks will be proportionally wrong.
//
//     THIS MODULE IS SAFE FOR:
//       ✓ Visual skeleton display on canvas
//       ✓ Animation / interpolation for UI purposes
//
//     THIS MODULE MUST NOT BE USED FOR:
//       ✗ Biomechanical angle measurement
//       ✗ Vaganova scoring or safety decisions
//       ✗ Any output labeled as "3D" or "depth-accurate"
//
//     Computed-point visibility values (neck=0.95, sternum=0.90, etc.) are
//     hardcoded constants, NOT propagated from source landmark confidence.
// ─────────────────────────────────────────────────────────────────────────────
import { PoseLandmark } from './realMediaPipePose';

export interface KinematicPoint {
  x: number; // Pixel coordinates (0 - videoWidth)
  y: number; // Pixel coordinates (0 - videoHeight)
  z?: number; // MediaPipe hip-relative depth estimate (NOT metric depth)
  vis: number; // Confidence (0.0 - 1.0); -1 = NOT_COMPUTED for predicted points
  isPredicted?: boolean;
}


export interface ReconstructedSkeleton {
  head: KinematicPoint;
  neck: KinematicPoint;
  sternum: KinematicPoint;
  navel: KinematicPoint;
  pelvisCenter: KinematicPoint;
  shoulderL: KinematicPoint;
  shoulderR: KinematicPoint;
  elbowL: KinematicPoint;
  elbowR: KinematicPoint;
  wristL: KinematicPoint;
  wristR: KinematicPoint;
  indexL?: KinematicPoint | null;
  indexR?: KinematicPoint | null;
  pelvisL: KinematicPoint;
  pelvisR: KinematicPoint;
  kneeL: KinematicPoint;
  kneeR: KinematicPoint;
  ankleL: KinematicPoint;
  ankleR: KinematicPoint;
  footL: KinematicPoint | null;
  footR: KinematicPoint | null;
}

class Vaganova3DKinematicsEngine {
  public reset() {}



  /**
   * Kinematic Reconstruction with occlusion fallbacks (marked as predicted)
   */
  public solve(
    landmarks2D: PoseLandmark[] | null,
    _landmarks3D: PoseLandmark[] | null,
    videoWidth: number = 1000,
    videoHeight: number = 1000
  ): ReconstructedSkeleton {
    const raw2D = (idx: number): KinematicPoint | null => {
      if (!landmarks2D || !landmarks2D[idx]) return null;
      const lm = landmarks2D[idx];
      const x = lm.x * videoWidth;
      const y = lm.y * videoHeight;
      return {
        x: isNaN(x) ? videoWidth / 2 : x,
        y: isNaN(y) ? videoHeight / 2 : y,
        z: lm.z,
        vis: lm.visibility ?? 1.0
      };
    };

    // Extract raw keypoints directly from MediaPipe
    let nose = raw2D(0);
    let shoulderL = raw2D(11);
    let shoulderR = raw2D(12);
    let elbowL = raw2D(13);
    let elbowR = raw2D(14);
    let wristL = raw2D(15);
    let wristR = raw2D(16);
    let indexL = raw2D(19);
    let indexR = raw2D(20);

    let pelvisL = raw2D(23);
    let pelvisR = raw2D(24);
    let kneeL = raw2D(25);
    let kneeR = raw2D(26);
    let ankleL = raw2D(27);
    let ankleR = raw2D(28);
    let footL = raw2D(31);
    let footR = raw2D(32);

    // Fallbacks if missing
    if (!shoulderL) shoulderL = { x: 430, y: 300, vis: 0, isPredicted: true };
    if (!shoulderR) shoulderR = { x: 570, y: 300, vis: 0, isPredicted: true };
    if (!pelvisL) pelvisL = { x: 440, y: 550, vis: 0, isPredicted: true };
    if (!pelvisR) pelvisR = { x: 560, y: 550, vis: 0, isPredicted: true };

    const validShoulderL = shoulderL;
    const validShoulderR = shoulderR;
    const validPelvisL = pelvisL;
    const validPelvisR = pelvisR;

    // Spine Axis
    const neck: KinematicPoint = {
      x: (validShoulderL.x + validShoulderR.x) / 2,
      y: (validShoulderL.y + validShoulderR.y) / 2,
      vis: 0.95
    };

    const pelvisCenter: KinematicPoint = {
      x: (validPelvisL.x + validPelvisR.x) / 2,
      y: (validPelvisL.y + validPelvisR.y) / 2,
      vis: 0.95
    };

    const sternum: KinematicPoint = {
      x: neck.x * 0.7 + pelvisCenter.x * 0.3,
      y: neck.y * 0.7 + pelvisCenter.y * 0.3,
      vis: 0.90
    };

    const navel: KinematicPoint = {
      x: neck.x * 0.3 + pelvisCenter.x * 0.7,
      y: neck.y * 0.3 + pelvisCenter.y * 0.7,
      vis: 0.90
    };

    // Head Position: Lock to Nose (Landmark 0) or directly above Neck
    const head: KinematicPoint = nose ? {
      x: nose.x,
      y: nose.y,
      vis: nose.vis
    } : {
      x: neck.x,
      y: neck.y - 50,
      vis: 0.8
    };

    // Arms: Use exact MediaPipe points or natural continuation along torso
    if (!elbowR) elbowR = { x: validShoulderR.x + 30, y: validShoulderR.y + 40, vis: 0, isPredicted: true };
    if (!wristR) wristR = { x: elbowR.x + 30, y: elbowR.y + 40, vis: 0, isPredicted: true };

    if (!elbowL) elbowL = { x: validShoulderL.x - 30, y: validShoulderL.y + 40, vis: 0, isPredicted: true };
    if (!wristL) wristL = { x: elbowL.x - 30, y: elbowL.y + 40, vis: 0, isPredicted: true };

    // Legs
    if (!kneeR) kneeR = { x: validPelvisR.x, y: validPelvisR.y + 150, vis: 0, isPredicted: true };
    if (!ankleR) ankleR = { x: kneeR.x, y: kneeR.y + 150, vis: 0, isPredicted: true };

    if (!kneeL) kneeL = { x: validPelvisL.x, y: validPelvisL.y + 150, vis: 0, isPredicted: true };
    if (!ankleL) ankleL = { x: kneeL.x, y: kneeL.y + 150, vis: 0, isPredicted: true };

    return {
      head,
      neck,
      sternum,
      navel,
      pelvisCenter,
      shoulderL: validShoulderL,
      shoulderR: validShoulderR,
      elbowL,
      elbowR,
      wristL,
      wristR,
      indexL,
      indexR,
      pelvisL: validPelvisL,
      pelvisR: validPelvisR,
      kneeL,
      kneeR,
      ankleL,
      ankleR,
      footL,
      footR
    };
  }
}

export const vaganova3DKinematics = new Vaganova3DKinematicsEngine();
