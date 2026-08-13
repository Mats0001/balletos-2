import { describe, expect, it } from 'vitest';
import { projectVideoSkeletonToAvatar, referenceToLiveTransform, transformAvatarSkeleton } from '../services/liveAvatarOverlay';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';

const p = (x: number, y: number) => ({ x, y, vis: 1 });
const skeleton = (offsetX = 0, scale = 1): ReconstructedSkeleton => ({
  head: p(offsetX + 50 * scale, 10 * scale), neck: p(offsetX + 50 * scale, 25 * scale), sternum: p(offsetX + 50 * scale, 40 * scale), navel: p(offsetX + 50 * scale, 55 * scale), pelvisCenter: p(offsetX + 50 * scale, 70 * scale),
  shoulderL: p(offsetX + 35 * scale, 30 * scale), shoulderR: p(offsetX + 65 * scale, 30 * scale), elbowL: p(offsetX + 25 * scale, 45 * scale), elbowR: p(offsetX + 75 * scale, 45 * scale), wristL: p(offsetX + 15 * scale, 60 * scale), wristR: p(offsetX + 85 * scale, 60 * scale),
  pelvisL: p(offsetX + 43 * scale, 70 * scale), pelvisR: p(offsetX + 57 * scale, 70 * scale), kneeL: p(offsetX + 43 * scale, 100 * scale), kneeR: p(offsetX + 57 * scale, 100 * scale), ankleL: p(offsetX + 43 * scale, 130 * scale), ankleR: p(offsetX + 57 * scale, 130 * scale), footL: p(offsetX + 35 * scale, 135 * scale), footR: p(offsetX + 65 * scale, 135 * scale),
});

describe('live avatar overlay projection', () => {
  it('projects by immutable video geometry rather than moving body bounds', () => {
    const first = projectVideoSkeletonToAvatar({ skeleton: skeleton(0), videoWidth: 200, videoHeight: 200 });
    const shifted = projectVideoSkeletonToAvatar({ skeleton: skeleton(20), videoWidth: 200, videoHeight: 200 });
    expect(first).not.toBeNull();
    expect(shifted!.pelvisCenter.x - first!.pelvisCenter.x).toBeCloseTo(34);
    expect(shifted!.pelvisCenter.y).toBe(first!.pelvisCenter.y);
  });

  it('aligns a technical body to the live pelvis and body scale', () => {
    const reference = skeleton(0, 1);
    const live = skeleton(20, 1.5);
    const transform = referenceToLiveTransform(reference, live);
    expect(transform).not.toBeNull();
    const aligned = transformAvatarSkeleton(reference, transform!);
    expect(aligned.pelvisCenter.x).toBeCloseTo(live.pelvisCenter.x);
    expect(aligned.pelvisCenter.y).toBeCloseTo(live.pelvisCenter.y);
    expect(transform!.scale).toBeCloseTo(1.5);
  });

  it('fails closed for invalid video geometry or predicted anchors', () => {
    expect(projectVideoSkeletonToAvatar({ skeleton: skeleton(), videoWidth: 0, videoHeight: 200 })).toBeNull();
    expect(referenceToLiveTransform({ ...skeleton(), neck: { ...p(50, 25), isPredicted: true } }, skeleton())).toBeNull();
  });
});

