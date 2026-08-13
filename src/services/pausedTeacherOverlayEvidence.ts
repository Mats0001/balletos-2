import { BUILD_POLICY } from '../config/buildPolicy';
import { PosePacket } from '../types/posePacket';
import {
  createBlockedPacket,
  TeacherHeuristicState,
  TeacherOverlayPacket,
} from '../types/teacherHeuristic';
import { FrameEntry } from './frameInterpolator';
import { OverlayStabilizer } from './overlayStabilizer';
import { PoseLandmark } from './realMediaPipePose';
import { TeacherHeuristicEngine } from './teacherHeuristicEngine';
import { vaganova3DKinematics } from './vaganova3DKinematics';
import { VaganovaAngleCalculator } from './vaganovaAngleCalculator';
import { vaganovaKineticAI } from './vaganovaKineticAI';
import { vaganovaMotionClassifier } from './vaganovaMotionClassifier';

type StateKey = Exclude<
  keyof TeacherOverlayPacket,
  'policyVersion' | 'streamEpoch' | 'framePtsSeconds'
>;

const STATE_KEYS: readonly StateKey[] = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
] as const;

/** Longest color confirmation is 500ms; retain one additional cache step. */
export const PAUSED_EVIDENCE_WINDOW_MS = 650;
const PTS_EPSILON_SECONDS = 0.000_001;
const EXACT_CACHE_PTS_TOLERANCE_MS = 0.001;
export const POSE_ANALYSIS_INTERVAL_MS = 50;

export interface PausedTeacherOverlayEvidenceInput {
  source: PosePacket['source'];
  frames: readonly FrameEntry[];
  targetPtsSeconds: number;
  streamEpoch: number;
  generation: number;
  videoWidth: number;
  videoHeight: number;
  cacheVideoWidth: number;
  cacheVideoHeight: number;
  canOutputColors: boolean;
}

function dimensionsMatch(
  videoWidth: number,
  videoHeight: number,
  cacheVideoWidth: number,
  cacheVideoHeight: number,
): boolean {
  return [videoWidth, videoHeight, cacheVideoWidth, cacheVideoHeight]
    .every(value => Number.isFinite(value) && value > 1)
    && Math.abs(videoWidth - cacheVideoWidth) <= 1
    && Math.abs(videoHeight - cacheVideoHeight) <= 1;
}

function landmarksAreValid(landmarks: readonly PoseLandmark[] | null): landmarks is readonly PoseLandmark[] {
  if (!landmarks || landmarks.length < 33) return false;

  return landmarks.every(landmark => (
    Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
    && landmark.x >= -0.5
    && landmark.x <= 1.5
    && landmark.y >= -0.5
    && landmark.y <= 1.5
    && (landmark.z === undefined || Number.isFinite(landmark.z))
    && (landmark.visibility === undefined || (
      Number.isFinite(landmark.visibility)
      && landmark.visibility >= 0
      && landmark.visibility <= 1
    ))
  ));
}

/** Returns only a real indexed pose at the exact paused media timestamp. */
export function findExactCachedPoseLandmarks(
  frames: readonly FrameEntry[],
  targetPtsSeconds: number,
): readonly PoseLandmark[] | null {
  if (!Number.isFinite(targetPtsSeconds) || targetPtsSeconds < 0) return null;
  const targetTimeMs = targetPtsSeconds * 1000;
  const exactTargetFrame = frames.find(frame => (
    Number.isFinite(frame.timeMs)
    && Math.abs(frame.timeMs - targetTimeMs) <= EXACT_CACHE_PTS_TOLERANCE_MS
  ));
  if (
    !exactTargetFrame
    || exactTargetFrame.resultKind === 'no_pose'
    || !landmarksAreValid(exactTargetFrame.landmarks)
  ) {
    return null;
  }
  return exactTargetFrame.landmarks;
}

/** Creates deterministic paused geometry without advancing a stateful filter. */
export function clonePausedCacheLandmarks(
  landmarks: readonly PoseLandmark[],
): PoseLandmark[] {
  return landmarks.map(landmark => ({ ...landmark }));
}

/** Same-packet redraws must never advance analysis or motion-trail state. */
export function shouldRefreshAnalysisForPosePacket(
  cachedPacketMediaTimeUs: number | null,
  nextPacketMediaTimeUs: number,
  elapsedSinceAnalysisMs: number,
): boolean {
  if (cachedPacketMediaTimeUs === null) return true;
  return nextPacketMediaTimeUs !== cachedPacketMediaTimeUs
    && elapsedSinceAnalysisMs >= POSE_ANALYSIS_INTERVAL_MS;
}

function targetMetadataIsValid(target: TeacherOverlayPacket, generation: number): boolean {
  return Number.isFinite(target.framePtsSeconds)
    && target.framePtsSeconds >= 0
    && Number.isFinite(target.streamEpoch)
    && Number.isFinite(generation)
    && target.policyVersion === BUILD_POLICY.policyVersion;
}

function normalizePausedRawPacket(packet: TeacherOverlayPacket): TeacherOverlayPacket {
  const normalized = { ...packet };
  // A composite torso match is not positive evidence if any constituent is
  // missing. The legacy engine currently ignores blocked constituents.
  if (
    normalized.spine === 'blocked'
    || normalized.shoulder === 'blocked'
    || normalized.pelvis === 'blocked'
  ) {
    normalized.torsoAlignment = 'blocked';
  }
  return normalized;
}

/**
 * Replays only causal raw packets through an isolated stabilizer. A region is
 * colored at the frozen target only when its stabilized state is already
 * confirmed and still equals the exact target frame's raw state.
 */
export function confirmCausalTeacherOverlayEvidence(
  priorPackets: readonly TeacherOverlayPacket[],
  targetRawPacket: TeacherOverlayPacket,
  generation: number,
): TeacherOverlayPacket {
  if (!targetMetadataIsValid(targetRawPacket, generation)) {
    return createBlockedPacket(
      targetRawPacket.framePtsSeconds,
      targetRawPacket.streamEpoch,
    );
  }
  const normalizedTarget = normalizePausedRawPacket(targetRawPacket);

  const windowStart = normalizedTarget.framePtsSeconds - PAUSED_EVIDENCE_WINDOW_MS / 1000;
  const causalCandidates = priorPackets
    .filter(packet => (
      Number.isFinite(packet.framePtsSeconds)
      && packet.framePtsSeconds >= Math.max(0, windowStart)
      && packet.framePtsSeconds
        < normalizedTarget.framePtsSeconds - PTS_EPSILON_SECONDS
    ));
  if (causalCandidates.some(packet => (
    packet.streamEpoch !== normalizedTarget.streamEpoch
    || packet.policyVersion !== normalizedTarget.policyVersion
  ))) {
    return createBlockedPacket(
      normalizedTarget.framePtsSeconds,
      normalizedTarget.streamEpoch,
    );
  }

  const causalPackets = causalCandidates
    .map(normalizePausedRawPacket)
    .slice()
    .sort((left, right) => left.framePtsSeconds - right.framePtsSeconds);

  const stabilizer = new OverlayStabilizer();
  for (const packet of causalPackets) {
    stabilizer.stabilize(packet, generation);
  }
  const stabilizedTarget = stabilizer.stabilize(normalizedTarget, generation);
  const result = { ...stabilizedTarget };

  // Never freeze the preceding state while a target-frame transition is still
  // pending. A mismatch is missing confirmation, therefore neutral.
  for (const key of STATE_KEYS) {
    const targetState: TeacherHeuristicState = normalizedTarget[key];
    result[key] = stabilizedTarget[key] === targetState ? targetState : 'blocked';
  }

  return result;
}

/**
 * Builds paused-frame teacher evidence from the already indexed, same-video
 * causal frame window. Live singleton state is never read or advanced.
 */
export function buildPausedTeacherOverlayEvidence(
  input: PausedTeacherOverlayEvidenceInput,
): TeacherOverlayPacket {
  const blocked = createBlockedPacket(input.targetPtsSeconds, input.streamEpoch);
  if (
    input.source !== 'frame_cache'
    || !input.canOutputColors
    || !Number.isFinite(input.targetPtsSeconds)
    || input.targetPtsSeconds < 0
    || !Number.isFinite(input.streamEpoch)
    || !Number.isFinite(input.generation)
    || !dimensionsMatch(
      input.videoWidth,
      input.videoHeight,
      input.cacheVideoWidth,
      input.cacheVideoHeight,
    )
  ) {
    return blocked;
  }

  const targetTimeMs = input.targetPtsSeconds * 1000;
  const exactTargetLandmarks = findExactCachedPoseLandmarks(
    input.frames,
    input.targetPtsSeconds,
  );
  if (!exactTargetLandmarks) return blocked;

  const heuristicEngine = new TeacherHeuristicEngine();
  const toRawPacket = (
    landmarks: readonly PoseLandmark[] | null,
    framePtsSeconds: number,
  ): TeacherOverlayPacket => {
    if (!landmarksAreValid(landmarks)) {
      return createBlockedPacket(framePtsSeconds, input.streamEpoch);
    }
    const mutableLandmarks = landmarks.map(landmark => ({ ...landmark }));
    // Keep the calculator isolated per frame. In particular, never derive an
    // individual knee-axis reference from an arbitrary 650ms pre-roll window.
    const calculator = new VaganovaAngleCalculator();
    const skeleton = vaganova3DKinematics.solve(
      mutableLandmarks,
      null,
      input.videoWidth,
      input.videoHeight,
    );
    const analysis = calculator.analyzeFullFrame(
      mutableLandmarks,
      input.videoWidth,
      input.videoHeight,
    );
    const motion = vaganovaMotionClassifier.classify(mutableLandmarks);
    const cog = vaganovaKineticAI.computeCenterOfGravity(skeleton);
    return heuristicEngine.compute(
      analysis,
      skeleton,
      framePtsSeconds,
      input.streamEpoch,
      { motion, cogX: cog.x },
    );
  };

  const priorPackets = input.frames
    .filter(frame => (
      Number.isFinite(frame.timeMs)
      && frame.timeMs >= Math.max(0, targetTimeMs - PAUSED_EVIDENCE_WINDOW_MS)
      && frame.timeMs < targetTimeMs - PTS_EPSILON_SECONDS * 1000
    ))
    .slice()
    .sort((left, right) => left.timeMs - right.timeMs)
    .map(frame => (
      frame.resultKind === 'no_pose'
        ? createBlockedPacket(frame.timeMs / 1000, input.streamEpoch)
        : toRawPacket(frame.landmarks, frame.timeMs / 1000)
    ));

  const targetRawPacket = toRawPacket(
    exactTargetLandmarks,
    input.targetPtsSeconds,
  );
  return confirmCausalTeacherOverlayEvidence(
    priorPackets,
    targetRawPacket,
    input.generation,
  );
}
