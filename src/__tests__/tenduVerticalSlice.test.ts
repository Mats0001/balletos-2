import { describe, expect, it } from 'vitest';
import { buildTenduTeachingFeedback } from '../services/tenduTeachingFeedback';
import { resolveTenduPilotFrame, TENDU_PILOT_REFERENCE } from '../services/tenduPilotReference';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from '../services/teacherPhaseAnalysis';
import { canCreateNicoleReferenceFromSource, isBundledNicoleTestClip } from '../services/referenceSourcePolicy';
import { MOTION_REFERENCE_LIBRARY } from '../services/motionReferenceLibrary';
import { TEACHER_REGION_KEYS, type TeacherRegionKey } from '../types/teacherHeuristic';
import { DRYAD_TENDU_COHORT_ASSET, TENDU_PILOT_ASSET_MANIFEST } from '../data/tenduPilotAssets.generated';

function regions(state = 'heuristic_attention_uncertain' as const) {
  return Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, {
    state, corridorResult: 'overlap', sampleCount: 4, agreement: 0.75, uncertainRatio: 0.25,
  }])) as TeacherPhaseResult['regions'];
}

const phase: TeacherPhaseResult = Object.freeze({
  id: 'extension', cycleIndex: 0, label: 'Abstreichen', startMs: 100, endMs: 300,
  representativeTimeMs: 200, confidence: 0.9,
  motion: { durationMs: 200, workingFootPathLength: 0.2, workingFootJitter: 0.004, sampleCount: 5 },
  regions: regions(), displayState: 'heuristic_attention_uncertain',
});
const analysis: TeacherPhaseAnalysis = Object.freeze({
  schemaVersion: 1, exerciseId: 'tendu', exerciseLabel: 'Battement Tendu', levelLabel: 'MINIS',
  workingSide: 'right', direction: 'a_la_seconde', directionConfidence: 0.88, phaseEngineConfidence: 0.9,
  phaseAuthority: 'teacher_assessment',
  cycleCount: 1, framesAnalyzed: 80, policyVersion: 'test', phases: Object.freeze([phase]),
  gate: Object.freeze({ status: 'ready', checks: Object.freeze([]), correctiveActions: Object.freeze([]), detectedPerspective: 'FRONTAL' }),
});

describe('Tendu vertical slice contracts', () => {
  it('maps the primary phase clock deterministically into the real technical pilot frames', () => {
    const first = resolveTenduPilotFrame(analysis, 150);
    const repeated = resolveTenduPilotFrame(analysis, 150);
    expect(first).toEqual(repeated);
    expect(first).toMatchObject({ kind: 'mapped', phaseProgress: 0.25 });
    if (first.kind === 'mapped') {
      expect(first.frame.phaseId).toBe('extension');
      expect(first.frame.joints.footR!.x).toBeGreaterThan(TENDU_PILOT_REFERENCE.clip.frames[0].joints.footR!.x);
    }
  });

  it('keeps technical datasets distinct from Nicole and product approval', () => {
    expect(MOTION_REFERENCE_LIBRARY.map(item => item.id)).toEqual(expect.arrayContaining([
      'dryad-tendu-2025', 'ucy-ballet-bvh', 'cmu-mocap-pilot', 'balletmoves-ii',
    ]));
    expect(MOTION_REFERENCE_LIBRARY.every(item => item.nicoleReviewStatus === 'not_reviewed')).toBe(true);
    expect(MOTION_REFERENCE_LIBRARY.find(item => item.id === 'balletmoves-ii')).toMatchObject({
      productStatus: 'license_required', pedagogicalStatus: 'technical_only',
    });
  });

  it('uses the reproducible 100-trial Dryad aggregate without shipping UCY joint coordinates', () => {
    expect(DRYAD_TENDU_COHORT_ASSET.clip).toMatchObject({
      cohortSize: 100,
      participantCount: 10,
      sourceTrialCount: 100,
    });
    expect(DRYAD_TENDU_COHORT_ASSET.clip.frames).toHaveLength(55);
    expect(TENDU_PILOT_ASSET_MANIFEST.ucy).toMatchObject({
      inspectedFrameCount: 99,
      exportedForm: 'aggregate stability report only; no derived joint coordinates',
      productStatus: 'internal_research_only_do_not_ship',
    });
    expect(TENDU_PILOT_ASSET_MANIFEST.ucy.stability.stable).toBe(true);
  });

  it('produces all five pending-Nicole teaching sections without medical claims', () => {
    const feedback = buildTenduTeachingFeedback(phase)!;
    expect(feedback).toMatchObject({ reviewState: 'pending_nicole', evidenceStyle: 'dotted' });
    expect([feedback.what, feedback.why, feedback.goal, feedback.practice, feedback.metaphor].every(Boolean)).toBe(true);
    expect(Object.keys(regions()).every(key => TEACHER_REGION_KEYS.includes(key as TeacherRegionKey))).toBe(true);
    expect(JSON.stringify(feedback)).not.toMatch(/diagnostiziert|Muskelschwäche|Verletzungsrisiko|Prognose/i);
  });

  it('permits bundled Nicole clips only as analysis input, never as reference sources', () => {
    expect(isBundledNicoleTestClip('/videos/nicole_saal_1.mp4')).toBe(true);
    expect(isBundledNicoleTestClip('https://local/videos/nicole_saal_9.mp4?x=1')).toBe(true);
    expect(canCreateNicoleReferenceFromSource('/videos/nicole_saal_6.mp4')).toBe(false);
    expect(canCreateNicoleReferenceFromSource('blob:http://local/new-approved-capture')).toBe(true);
  });
});
