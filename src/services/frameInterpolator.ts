import { PoseLandmark } from './realMediaPipePose';

export interface FrameEntry {
  timeMs: number;
  landmarks: PoseLandmark[];
  worldLandmarks?: PoseLandmark[];
}

/**
 * Interpolates between two frames of pose landmarks.
 * 
 * @param a Landmarks for the first frame
 * @param b Landmarks for the second frame
 * @param t Interpolation factor (0 = a, 1 = b)
 * @returns Interpolated landmarks array
 */
export function interpolateFrame(a: PoseLandmark[], b: PoseLandmark[], t: number): PoseLandmark[] {
  const len = Math.max(a.length, b.length);
  const out = new Array<PoseLandmark>(len);

  for (let i = 0; i < len; i++) {
    const lmA = i < a.length ? a[i] : b[i];
    const lmB = i < b.length ? b[i] : a[i];

    const visA = lmA.visibility ?? 1;
    const visB = lmB.visibility ?? 1;

    if (visA < 0.3 || visB < 0.3) {
      // Skip interpolation and use the one with higher visibility
      out[i] = visA >= visB ? lmA : lmB;
      continue;
    }

    const visibility = Math.min(visA, visB);
    const result: PoseLandmark = {
      x: lmA.x + (lmB.x - lmA.x) * t,
      y: lmA.y + (lmB.y - lmA.y) * t,
      z: 0,
      visibility,
    };

    if (lmA.z !== undefined && lmB.z !== undefined) {
      result.z = lmA.z + (lmB.z - lmA.z) * t;
    } else if (lmA.z !== undefined) {
      result.z = lmA.z;
    } else if (lmB.z !== undefined) {
      result.z = lmB.z;
    }

    out[i] = result;
  }

  return out;
}

/**
 * Binary searches for the two frames bracketing a target time.
 * 
 * @param frames Array of frame entries sorted by timeMs
 * @param targetTimeMs The target time to find
 * @returns The bracketing frames and interpolation factor, or null if frames is empty
 */
export function findBracketingFrames(
  frames: FrameEntry[], 
  targetTimeMs: number
): { before: FrameEntry; after: FrameEntry; t: number } | null {
  if (frames.length === 0) return null;

  if (targetTimeMs <= frames[0].timeMs) {
    return { before: frames[0], after: frames[0], t: 0 };
  }

  const lastIdx = frames.length - 1;
  if (targetTimeMs >= frames[lastIdx].timeMs) {
    return { before: frames[lastIdx], after: frames[lastIdx], t: 0 };
  }

  // Binary search O(log n)
  let low = 0;
  let high = lastIdx;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midTime = frames[mid].timeMs;

    if (midTime === targetTimeMs) {
      return { before: frames[mid], after: frames[mid], t: 0 };
    } else if (midTime < targetTimeMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // At this point, high is the index of the largest time < targetTimeMs
  // and low is the index of the smallest time > targetTimeMs
  const before = frames[high];
  const after = frames[low];

  const timeDiff = after.timeMs - before.timeMs;
  const t = timeDiff > 0 ? (targetTimeMs - before.timeMs) / timeDiff : 0;

  return { before, after, t };
}
