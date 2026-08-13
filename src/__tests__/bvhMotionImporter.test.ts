import { describe, expect, it } from 'vitest';
import { importBvhCanonicalMotion } from '../services/bvhMotionImporter';

const PROVENANCE = Object.freeze({
  datasetId: 'ucy:test',
  sourceUrl: 'https://dancedb.cs.ucy.ac.cy/',
  sourceKind: 'bvh_skeleton' as const,
  rightsStatus: 'internal_research_only' as const,
  licenseLabel: 'UCY internal pilot',
  pedagogicalStatus: 'technical_only' as const,
  nicoleReviewStatus: 'not_reviewed' as const,
});

const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 100 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 20 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Head
    {
      OFFSET 0 30 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site { OFFSET 0 10 0 }
    }
  }
  JOINT LeftUpLeg
  {
    OFFSET -10 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftLeg
    {
      OFFSET 0 -40 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT LeftFoot
      {
        OFFSET 0 -40 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT LeftToeBase
        {
          OFFSET 0 -5 15
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site { OFFSET 0 0 5 }
        }
      }
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.00833333
0 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
10 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0`;

describe('BVH canonical motion importer', () => {
  it('evaluates hierarchy transforms and maps canonical joint positions', () => {
    const clip = importBvhCanonicalMotion({
      bvh: BVH,
      clipId: 'ucy-ballet-test',
      label: 'UCY Ballet Test',
      provenance: PROVENANCE,
      sourceUnitScaleMeters: 0.01,
    });

    expect(clip.frames).toHaveLength(2);
    expect(clip.frameRateHz).toBeCloseTo(120, 3);
    expect(clip.frames[0].joints.pelvisCenter).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(clip.frames[0].joints.head?.y).toBeCloseTo(1.5, 6);
    expect(clip.frames[0].joints.footL).toMatchObject({ x: -0.1, y: 0.15, z: 0.15 });
    expect(clip.frames[1].joints.pelvisCenter?.x).toBeCloseTo(0.1, 6);
    expect(clip.provenance.rightsStatus).toBe('internal_research_only');
  });

  it('rejects incomplete motion channels instead of inventing geometry', () => {
    const truncated = `${BVH.slice(0, BVH.lastIndexOf('\n'))}\n0 0`;
    expect(() => importBvhCanonicalMotion({
      bvh: truncated,
      clipId: 'broken',
      label: 'Broken',
      provenance: PROVENANCE,
    })).toThrow(/channels/);
  });
});
