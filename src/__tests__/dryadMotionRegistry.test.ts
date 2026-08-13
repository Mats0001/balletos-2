import { describe, expect, it } from 'vitest';
import { buildDryadTechnicalCohortAsset } from '../services/dryadMotionCohort';
import { importDryadMotionTrial } from '../services/dryadMotionImporter';
import { MOTION_REGISTRY, resolveMotionRegistryEntry, selectableMotionEntries } from '../services/motionRegistry';
import { DRYAD_MOTION_ASSET_MANIFEST, DRYAD_TECHNICAL_MOTION_ASSETS } from '../data/dryadMotionAssets.generated';
import { DRYAD_TECHNICAL_PHASE_PRIORS } from '../data/dryadTechnicalPhasePriors.generated';

function motionCsv(rightAmplitude = 2, leftAmplitude = 0.2): string {
  const header = 'trial,time,C7_z,RAnkle_x,RAnkle_y,RAnkle_z,LAnkle_x,LAnkle_y,LAnkle_z,RToe_x,RToe_y,RToe_z,LToe_x,LToe_y,LToe_z';
  const rows = Array.from({ length: 250 }, (_, index) => {
    const time = -500 + index * 4;
    const shape = Math.sin(index / 249 * Math.PI);
    return `1,${time},1400,0,100,100,0,-100,100,0,${100 + shape * rightAmplitude * 100},50,0,${-100 - shape * leftAmplitude * 100},50`;
  });
  return [header, ...rows].join('\n');
}

describe('general Dryad motion pipeline', () => {
  it('imports Passé, Jeté and Changement with source-specific technical events', () => {
    const passe = importDryadMotionTrial({
      movementId: 'passe', mocapCsv: motionCsv(), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,BB,VBU,BR,VFU,FT,VFD,BF,VBD\n1,1,168,280,424,416,-440,-288,-168,60',
    });
    const jete = importDryadMotionTrial({
      movementId: 'jete', mocapCsv: motionCsv(), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,FLS,VR,FR,VL,FLE\n1,1,-160,48,288,-500,-296',
    });
    const changement = importDryadMotionTrial({
      movementId: 'changement', mocapCsv: motionCsv(1, 1), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,GC,GP1,BB,GP2,GL,BT\n1,1,-55,94,156,215,347,-224',
    });

    expect(passe.events.map(event => event.id)).toEqual(['BB', 'VBU', 'VFU', 'BR', 'FT', 'VFD', 'BF', 'VBD']);
    expect(jete.events.map(event => event.id)).toEqual(['FLS', 'VR', 'FR', 'VL', 'FLE']);
    expect(changement.events.map(event => event.id)).toEqual(['GC', 'GP1', 'BB', 'GP2', 'GL', 'BT']);
    expect(passe.workingSide).toBe('right');
    expect(changement.workingSide).toBe('bilateral');
    expect([passe, jete, changement].every(clip => (
      clip.provenance.pedagogicalStatus === 'technical_only'
      && clip.provenance.nicoleReviewStatus === 'not_reviewed'
      && clip.frames.length >= 10
    ))).toBe(true);
  });

  it('emits non-reversible cohort medians with event uncertainty', () => {
    const reference = 'ID,Trial,FLS,VR,FR,VL,FLE\n1,1,-160,48,288,-500,-296\n2,1,-140,68,308,-480,-276';
    const first = importDryadMotionTrial({
      movementId: 'jete', mocapCsv: motionCsv(2, 0.2), movementReferenceCsv: reference,
      participantId: 1, trial: 1,
    });
    const second = importDryadMotionTrial({
      movementId: 'jete', mocapCsv: motionCsv(2.4, 0.2), movementReferenceCsv: reference,
      participantId: 2, trial: 1,
    });
    const cohort = buildDryadTechnicalCohortAsset({
      trials: [first, second], generatedFromDigest: 'a'.repeat(64), frameCount: 21,
    });

    expect(cohort.clip).toMatchObject({
      exerciseId: 'jete', participantCount: 2, sourceTrialCount: 2,
      workingSide: 'right', coordinateSystem: 'balletos_body_normalized_right_up_forward',
    });
    expect(cohort.clip.frames).toHaveLength(21);
    expect(cohort.eventTiming).toHaveLength(5);
    expect(cohort.eventTiming.every(event => event.sourceSampleCount === 2)).toBe(true);
    expect(cohort.p90FootPathSpread).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(cohort)).not.toContain('participantId');
  });

  it('fails closed for missing source events and mixed movements', () => {
    expect(() => importDryadMotionTrial({
      movementId: 'jete', mocapCsv: motionCsv(), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,FLS\n1,1,0',
    })).toThrow();
    const jete = importDryadMotionTrial({
      movementId: 'jete', mocapCsv: motionCsv(), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,FLS,VR,FR,VL,FLE\n1,1,-160,48,288,-500,-296',
    });
    const changement = importDryadMotionTrial({
      movementId: 'changement', mocapCsv: motionCsv(), participantId: 1, trial: 1,
      movementReferenceCsv: 'ID,Trial,GC,GP1,BB,GP2,GL,BT\n1,1,-55,94,156,215,347,-224',
    });
    expect(() => buildDryadTechnicalCohortAsset({
      trials: [jete, changement], generatedFromDigest: 'a'.repeat(64),
    })).toThrow(/mixes/i);
  });

  it('registers imported motions separately from assessment-ready motions', () => {
    expect(MOTION_REGISTRY.map(entry => entry.id)).toEqual(['plie', 'tendu', 'passe', 'jete', 'changement']);
    expect(MOTION_REGISTRY.filter(entry => entry.phaseEngineStatus === 'assessment_ready').map(entry => entry.id))
      .toEqual(['plie', 'tendu']);
    expect(MOTION_REGISTRY.filter(entry => entry.phaseEngineStatus === 'technical_phase_pilot').map(entry => entry.id))
      .toEqual(['passe', 'jete', 'changement']);
    expect(selectableMotionEntries().map(entry => entry.id))
      .toEqual(['plie', 'tendu', 'passe', 'jete', 'changement']);
    expect(resolveMotionRegistryEntry('Battement Tendu devant')?.id).toBe('tendu');
    expect(resolveMotionRegistryEntry('Passé')?.id).toBe('passe');
    expect(DRYAD_TECHNICAL_MOTION_ASSETS.map(asset => asset.clip.exerciseId))
      .toEqual(['passe', 'jete', 'changement']);
    expect(DRYAD_TECHNICAL_MOTION_ASSETS.every(asset => (
      asset.clip.provenance.pedagogicalStatus === 'technical_only'
      && asset.clip.provenance.nicoleReviewStatus === 'not_reviewed'
    ))).toBe(true);
    expect(DRYAD_MOTION_ASSET_MANIFEST.movements).toMatchObject([
      { movementId: 'passe', importedTrialCount: 100 },
      { movementId: 'jete', importedTrialCount: 100 },
      { movementId: 'changement', importedTrialCount: 81 },
    ]);
  });

  it('keeps the compact runtime timing priors bound to the full generated cohorts', () => {
    for (const prior of DRYAD_TECHNICAL_PHASE_PRIORS) {
      const asset = DRYAD_TECHNICAL_MOTION_ASSETS.find(candidate => candidate.clip.exerciseId === prior.exerciseId)!;
      const expectedPeak = prior.exerciseId === 'passe'
        ? asset.eventTiming.find(event => event.eventId === 'FT')!.medianProgress
        : prior.exerciseId === 'jete'
          ? asset.eventTiming.find(event => event.eventId === 'FR')!.medianProgress
          : (
            asset.eventTiming.find(event => event.eventId === 'GP2')!.medianProgress
            + asset.eventTiming.find(event => event.eventId === 'GL')!.medianProgress
          ) / 2;
      expect(prior).toMatchObject({
        datasetId: asset.clip.provenance.datasetId,
        generatedFromDigest: asset.generatedFromDigest,
        sourceSampleCount: asset.clip.sourceTrialCount,
      });
      expect(prior.expectedPeakProgress).toBe(expectedPeak);
    }
  });
});
