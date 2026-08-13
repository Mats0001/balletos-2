export type SkeletonPointId =
  | 'head'
  | 'neck'
  | 'sternum'
  | 'navel'
  | 'pelvisCenter'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'wristL'
  | 'wristR'
  | 'pelvisL'
  | 'pelvisR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR'
  | 'footL'
  | 'footR';

export type SkeletonTargetId =
  | 'joint.head'
  | 'joint.neck'
  | 'joint.sternum'
  | 'joint.navel'
  | 'joint.pelvis_center'
  | 'joint.shoulder_l'
  | 'joint.shoulder_r'
  | 'joint.elbow_l'
  | 'joint.elbow_r'
  | 'joint.wrist_l'
  | 'joint.wrist_r'
  | 'joint.hip_l'
  | 'joint.hip_r'
  | 'joint.knee_l'
  | 'joint.knee_r'
  | 'joint.ankle_l'
  | 'joint.ankle_r'
  | 'joint.foot_l'
  | 'joint.foot_r'
  | 'bone.head_neck'
  | 'bone.neck_sternum'
  | 'bone.sternum_navel'
  | 'bone.navel_pelvis'
  | 'bone.shoulder_line'
  | 'bone.upper_arm_l'
  | 'bone.upper_arm_r'
  | 'bone.forearm_l'
  | 'bone.forearm_r'
  | 'bone.torso_side_l'
  | 'bone.torso_side_r'
  | 'bone.pelvis_line'
  | 'bone.thigh_l'
  | 'bone.thigh_r'
  | 'bone.shin_l'
  | 'bone.shin_r'
  | 'bone.foot_l'
  | 'bone.foot_r';

export type SkeletonTargetFocusId =
  | 'head_epaulement'
  | 'shoulder_line'
  | 'left_elbow'
  | 'right_elbow'
  | 'spine_center'
  | 'pelvis_core'
  | 'left_knee'
  | 'right_knee';

export type SkeletonOverlayRegionKey =
  | 'torsoAlignment'
  | 'spine'
  | 'shoulder'
  | 'pelvis'
  | 'armL'
  | 'armR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR'
  | 'cog'
  | 'head';

export type GroundedMetricAdapterId =
  | 'spine_tilt_aplomb'
  | 'shoulder_horizontal'
  | 'projected_hip_line_obliquity';

export interface SkeletonTargetDefinition {
  id: SkeletonTargetId;
  kind: 'joint' | 'bone';
  label: string;
  shortLabel: string;
  side: 'left' | 'right' | 'center';
  pointIds: readonly SkeletonPointId[];
  overlayRegion: SkeletonOverlayRegionKey;
  focusId: SkeletonTargetFocusId;
  representativeLandmarkIndex: number;
  metricAdapter?: GroundedMetricAdapterId;
  /** Human-readable scope when an adapter evaluates a wider region than the clicked target. */
  metricScopeLabel?: string;
}

export interface SelectedSkeletonTarget {
  targetId: SkeletonTargetId;
  kind: 'joint' | 'bone';
  anchorNormalized: Readonly<{ x: number; y: number }>;
  sourceId: string;
  streamEpoch: number;
  generation: number;
  mediaTimeUs: number;
  /** Segment position retained while the same bone is rebound to an exact cache frame. */
  segmentT?: number;
  frameStatus: 'display_frame' | 'pending_exact_frame' | 'exact_cache_frame';
}

export interface SkeletonTargetFrameContext {
  sourceId: string;
  streamEpoch: number;
  generation: number;
  mediaTimeUs: number;
}
