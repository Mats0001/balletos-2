import { describe, expect, it } from 'vitest';
import { buildTeacherFeedbackDraft, feedbackPhaseIds } from '../services/teacherFeedbackLibrary';
import type { BalletMotionId } from '../types/motionRegistry';
import { TEACHER_REGION_KEYS } from '../types/teacherHeuristic';
import type { FeedbackAgeBand } from '../types/teacherFeedbackLibrary';

const EXERCISES: readonly BalletMotionId[] = ['plie', 'tendu', 'passe', 'jete', 'changement'];
const AGES: readonly FeedbackAgeBand[] = ['minis', 'kids', 'teens', 'pro'];
const STATES = ['heuristic_match', 'heuristic_attention', 'heuristic_strong_attention'] as const;

describe('teacher feedback library scaffold', () => {
  it('covers every registered exercise, phase, region, age band and traffic class', () => {
    let count = 0;
    for (const exerciseId of EXERCISES) {
      expect(feedbackPhaseIds(exerciseId)).toHaveLength(5);
      for (const phaseId of feedbackPhaseIds(exerciseId)) {
        for (const region of TEACHER_REGION_KEYS) {
          for (const ageBand of AGES) {
            for (const trafficClass of STATES) {
              const draft = buildTeacherFeedbackDraft({ exerciseId, phaseId, region, ageBand, trafficClass, evidenceStrength: 'uncertain' });
              expect(draft).not.toBeNull();
              expect(draft).toMatchObject({ reviewState: 'pending_nicole', learnerVisible: false, parentVisible: false, evidenceStyle: 'dotted' });
              expect(Object.values(draft!.sections).every(Boolean)).toBe(true);
              count++;
            }
          }
        }
      }
    }
    expect(count).toBe(EXERCISES.length * 5 * TEACHER_REGION_KEYS.length * AGES.length * STATES.length);
  });

  it('keeps observation, possible effect and cause boundary explicit', () => {
    const draft = buildTeacherFeedbackDraft({ exerciseId: 'tendu', phaseId: 'extension', region: 'footR', ageBand: 'minis', trafficClass: 'heuristic_attention', evidenceStrength: 'stable' })!;
    expect(draft.sections.what).toMatch(/sichtbaren Korridor/i);
    expect(draft.sections.whyPossible).toMatch(/kann|nicht automatisch die Ursache/i);
    expect(draft.sections.metaphor).toMatch(/Stell dir vor/i);
    expect(draft.evidenceStyle).toBe('solid');
    expect(JSON.stringify(draft)).not.toMatch(/diagnostiziert|Muskelschwäche|Verletzungsrisiko|Prognose/i);
  });

  it('fails closed for unknown phases', () => {
    expect(buildTeacherFeedbackDraft({ exerciseId: 'tendu', phaseId: 'unknown', region: 'footR', ageBand: 'kids', trafficClass: 'heuristic_match', evidenceStrength: 'stable' })).toBeNull();
  });
});

