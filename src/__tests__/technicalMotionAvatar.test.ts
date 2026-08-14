import { describe, expect, it } from 'vitest';
import {
  motionAvatarPhaseOrder,
  motionAvatarReference,
  resolveTechnicalMotionAvatarFrame,
} from '../services/technicalMotionAvatar';
import type { TeacherPhaseAnalysis, TeacherPhaseResult } from '../services/teacherPhaseAnalysis';
import { TEACHER_REGION_KEYS } from '../types/teacherHeuristic';
import type { BalletMotionId } from '../types/motionRegistry';
import { projectCanonicalFrameToSkeleton } from '../services/canonicalMotionAvatar';

const PHASES = {
  passe: ['preparation', 'lift', 'placement', 'lower', 'finish'],
  jete: ['preparation', 'brush', 'release', 'return', 'finish'],
  changement: ['preparation', 'takeoff', 'flight', 'landing', 'finish'],
} as const;

function analysis(exerciseId: Extract<BalletMotionId, 'passe' | 'jete' | 'changement'>): TeacherPhaseAnalysis {
  const phases = PHASES[exerciseId].map((id, index): TeacherPhaseResult => ({
    id,
    cycleIndex: 0,
    label: id,
    startMs: index * 200,
    endMs: (index + 1) * 200,
    representativeTimeMs: index * 200 + 100,
    confidence: .82,
    motion: { durationMs: 200, workingFootPathLength: .1, workingFootJitter: .01, sampleCount: 5 },
    displayState: 'heuristic_attention_uncertain',
    regions: Object.fromEntries(TEACHER_REGION_KEYS.map(key => [key, {
      state: 'heuristic_attention_uncertain', corridorResult: 'overlap', sampleCount: 5, agreement: .7, uncertainRatio: .3,
    }])) as TeacherPhaseResult['regions'],
  }));
  return {
    schemaVersion: 1,
    exerciseId,
    exerciseLabel: exerciseId,
    levelLabel: 'KIDS',
    workingSide: exerciseId === 'changement' ? null : 'right',
    direction: exerciseId === 'changement' ? null : 'undetermined',
    directionConfidence: .6,
    phaseEngineConfidence: .8,
    phaseAuthority: 'technical_phase_pilot',
    cycleCount: 1,
    gate: { status: 'usable_with_caution', checks: [], correctiveActions: [], detectedPerspective: 'FRONTAL' },
    phases,
    framesAnalyzed: 60,
    policyVersion: 'test',
  };
}

describe('technical single-clock motion avatar', () => {
  it.each(['passe', 'jete', 'changement'] as const)(
    'retargets the real Dryad %s cohort onto a complete neutral line body',
    exerciseId => {
      const reference = motionAvatarReference(exerciseId);
      const resolution = resolveTechnicalMotionAvatarFrame(analysis(exerciseId), 500);

      expect(reference.frames).toHaveLength(61);
      expect(reference.sourceSampleCount).toBe(exerciseId === 'changement' ? 81 : 100);
      expect(reference.sourceLabels.join(' ')).toContain('nicht Nicole-geprüft');
      expect(reference.limitations.join(' ')).toContain('keine pädagogische Sollbewegung');
      expect(Object.keys(reference.frames[30].frame.joints)).toHaveLength(19);
      expect(resolution.kind).toBe('mapped');
      if (resolution.kind === 'mapped') {
        expect(resolution.reference.exerciseId).toBe(exerciseId);
        expect(resolution.phase.id).toBe(PHASES[exerciseId][2]);
        expect(resolution.referenceProgress).toBeCloseTo(.5, 4);
        expect(resolution.frame.joints.head).toBeTruthy();
        expect(resolution.frame.joints.footR).toBeTruthy();
      }
    },
  );

  it('keeps one deterministic five-phase mapping on the primary analysis clock', () => {
    const passe = analysis('passe');
    const first = resolveTechnicalMotionAvatarFrame(passe, 210);
    const repeated = resolveTechnicalMotionAvatarFrame(passe, 210);
    const later = resolveTechnicalMotionAvatarFrame(passe, 790);

    expect(first).toEqual(repeated);
    expect(first.kind).toBe('mapped');
    expect(later.kind).toBe('mapped');
    if (first.kind === 'mapped' && later.kind === 'mapped') {
      expect(first.phase.id).toBe('lift');
      expect(later.phase.id).toBe('lower');
      expect(first.referenceProgress).toBeLessThan(later.referenceProgress);
      expect(first.frame.joints.footR).not.toEqual(later.frame.joints.footR);
    }
    expect(motionAvatarPhaseOrder('passe')).toEqual(PHASES.passe);
  });

  it('uses one sequence-wide projection box so the technical avatar cannot pump per frame', () => {
    const reference = motionAvatarReference('changement');
    const first = projectCanonicalFrameToSkeleton({
      frame: reference.frames[0].frame, width: 360, height: 360, sourceBounds: reference.projectionBounds,
    });
    const flight = projectCanonicalFrameToSkeleton({
      frame: reference.frames[30].frame, width: 360, height: 360, sourceBounds: reference.projectionBounds,
    });
    const firstShoulderWidth = Math.abs(first.shoulderR.x - first.shoulderL.x);
    const flightShoulderWidth = Math.abs(flight.shoulderR.x - flight.shoulderL.x);

    expect(firstShoulderWidth).toBeCloseTo(flightShoulderWidth, 8);
    expect(flight.neck.y).not.toBe(first.neck.y);
  });

  it('mirrors a right-sided technical source for a detected left working side', () => {
    const leftPasse = { ...analysis('passe'), workingSide: 'left' as const };
    const resolution = resolveTechnicalMotionAvatarFrame(leftPasse, 500);
    expect(resolution.kind).toBe('mapped');
    if (resolution.kind !== 'mapped') return;
    expect(resolution.reference.workingSides).toEqual(['right']);
    expect(resolution.mirrorX).toBe(true);
    const normal = projectCanonicalFrameToSkeleton({
      frame: resolution.frame, width: 360, height: 360, sourceBounds: resolution.reference.projectionBounds,
    });
    const mirrored = projectCanonicalFrameToSkeleton({
      frame: resolution.frame, width: 360, height: 360, sourceBounds: resolution.reference.projectionBounds, mirrorX: resolution.mirrorX,
    });
    expect(normal.footR).toBeTruthy();
    expect(mirrored.footR).toBeTruthy();
    expect(mirrored.footR!.x).toBeCloseTo(360 - normal.footR!.x, 8);
  });

  it('fails closed for Plié, recording problems and missing phase windows', () => {
    expect(resolveTechnicalMotionAvatarFrame({ ...analysis('passe'), exerciseId: 'plie' }, 100)).toEqual({
      kind: 'blocked', reason: 'unsupported_exercise',
    });
    expect(resolveTechnicalMotionAvatarFrame({
      ...analysis('jete'), gate: { ...analysis('jete').gate, status: 'needs_correction' },
    }, 100)).toEqual({ kind: 'blocked', reason: 'recording_gate' });
    expect(resolveTechnicalMotionAvatarFrame({ ...analysis('changement'), phases: [] }, 100)).toEqual({
      kind: 'blocked', reason: 'outside_phase',
    });
  });
});
