import { describe, expect, it } from 'vitest';
import {
  SKELETON_TARGETS,
  createSelectedSkeletonTarget,
  findSkeletonTargetAtPoint,
  getSkeletonTarget,
  resolveSkeletonTargetAnchor,
} from '../services/skeletonTargetRegistry';
import { vaganova3DKinematics } from '../services/vaganova3DKinematics';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';

const point = (x: number, y: number, vis = 1) => ({ x, y, vis });
const skeleton: ReconstructedSkeleton = {
  head: point(500, 80), neck: point(500, 160), sternum: point(500, 260),
  navel: point(500, 400), pelvisCenter: point(500, 520),
  shoulderL: point(390, 180), shoulderR: point(610, 180),
  elbowL: point(300, 300), elbowR: point(700, 300),
  wristL: point(220, 400), wristR: point(780, 400),
  pelvisL: point(440, 520), pelvisR: point(560, 520),
  kneeL: point(430, 710), kneeR: point(570, 710),
  ankleL: point(420, 900), ankleR: point(580, 900),
  footL: point(380, 930), footR: point(620, 930),
};

function hit(x: number, y: number, source: ReconstructedSkeleton = skeleton) {
  return findSkeletonTargetAtPoint({
    skeleton: source,
    canvasX: x,
    canvasY: y,
    canvasWidth: 1000,
    canvasHeight: 1000,
    videoWidth: 1000,
    videoHeight: 1000,
  });
}

describe('skeleton target registry', () => {
  it('has stable unique identities for every rendered joint and bone', () => {
    expect(SKELETON_TARGETS).toHaveLength(37);
    expect(new Set(SKELETON_TARGETS.map(target => target.id)).size).toBe(37);
    expect(SKELETON_TARGETS.filter(target => target.kind === 'joint')).toHaveLength(19);
    expect(SKELETON_TARGETS.filter(target => target.kind === 'bone')).toHaveLength(18);
    expect(getSkeletonTarget('bone.shoulder_line')).toMatchObject({
      metricAdapter: 'shoulder_horizontal',
      focusId: 'shoulder_line',
    });
    expect(getSkeletonTarget('bone.pelvis_line')).toMatchObject({
      metricAdapter: 'projected_hip_line_obliquity',
      focusId: 'pelvis_core',
    });
  });

  it('preserves the exact clicked bone instead of collapsing it to a representative joint', () => {
    const upperArm = hit(345, 240);
    const forearm = hit(260, 350);

    expect(upperArm?.target.id).toBe('bone.upper_arm_l');
    expect(forearm?.target.id).toBe('bone.forearm_l');
    expect(upperArm?.anchorNormalized).toEqual({ x: 0.345, y: 0.24 });
  });

  it('prefers the joint at a shared endpoint and anchors a bone at the actual click projection', () => {
    expect(hit(300, 300)?.target.id).toBe('joint.elbow_l');
    const torso = hit(420, 350);
    expect(torso?.target.id).toBe('bone.torso_side_l');
    expect(torso?.anchorNormalized.x).toBeCloseTo(0.4151, 4);
  });

  it('rejects missing, predicted and low-visibility target geometry', () => {
    expect(hit(345, 240, { ...skeleton, elbowL: { ...skeleton.elbowL, vis: 0.2 } })?.target.id).not.toBe('bone.upper_arm_l');
    expect(hit(345, 240, { ...skeleton, elbowL: { ...skeleton.elbowL, isPredicted: true } })?.target.id).not.toBe('bone.upper_arm_l');
    expect(findSkeletonTargetAtPoint({
      skeleton, canvasX: 1, canvasY: 1, canvasWidth: 0, canvasHeight: 1000,
      videoWidth: 1000, videoHeight: 1000,
    })).toBeNull();
  });

  it('keeps frame identity when creating a selected target', () => {
    const found = hit(345, 240);
    expect(found).not.toBeNull();
    if (!found) return;
    const selected = createSelectedSkeletonTarget(found, {
      sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs: 1_500_000,
      frameStatus: 'exact_cache_frame',
    });
    expect(selected).toMatchObject({
      targetId: 'bone.upper_arm_l', kind: 'bone', sourceId: 'clip-a',
      streamEpoch: 4, generation: 2, mediaTimeUs: 1_500_000,
    });
    expect(Object.isFrozen(selected)).toBe(true);
    expect(getSkeletonTarget(selected.targetId)?.shortLabel).toBe('L-Oberarm');
  });

  it('exposes selectable foot points and their actually rendered foot bones', () => {
    expect(hit(380, 930)?.target.id).toBe('joint.foot_l');
    expect(hit(400, 915)?.target.id).toBe('bone.foot_l');
    expect(getSkeletonTarget('bone.foot_r')?.pointIds).toEqual(['ankleR', 'footR']);
  });

  it('rebinds the same bone position to new exact-frame geometry', () => {
    const target = getSkeletonTarget('bone.upper_arm_l');
    expect(target).not.toBeNull();
    if (!target) return;
    const shifted = {
      ...skeleton,
      shoulderL: point(410, 200),
      elbowL: point(250, 340),
    };
    const anchor = resolveSkeletonTargetAnchor(shifted, target, 1000, 1000, 0.4);
    expect(anchor).toEqual({ x: 0.346, y: 0.256 });
  });

  it('propagates missing source evidence into synthetic torso points', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    landmarks[11].visibility = 0;
    landmarks[12].visibility = 0;
    const reconstructed = vaganova3DKinematics.solve(landmarks, null, 1000, 1000);

    expect(reconstructed.neck.vis).toBe(0);
    expect(hit(500, 160, reconstructed)?.target.id).not.toBe('joint.neck');
    expect(hit(500, 260, reconstructed)?.target.id).not.toBe('joint.sternum');
  });

  it('never turns malformed coordinates or missing visibility into selectable center points', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    landmarks[13] = { ...landmarks[13], x: Number.NaN };
    landmarks[15] = { ...landmarks[15], visibility: Number.NaN };
    const reconstructed = vaganova3DKinematics.solve(landmarks, null, 1000, 1000);

    expect(reconstructed.elbowL.isPredicted).toBe(true);
    expect(reconstructed.wristL.isPredicted).toBe(true);
    expect(hit(500, 500, reconstructed)?.target.id).not.toBe('joint.elbow_l');
    expect(hit(500, 500, reconstructed)?.target.id).not.toBe('joint.wrist_l');
  });
});
