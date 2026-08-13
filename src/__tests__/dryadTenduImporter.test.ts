import { describe, expect, it } from 'vitest';
import { importDryadTenduTrial } from '../services/dryadTenduImporter';

function motionCsv(): string {
  const header = 'trial,time,C7_z,RAnkle_x,RAnkle_y,RAnkle_z,LAnkle_x,LAnkle_y,LAnkle_z,RToe_x,RToe_y,RToe_z,LToe_x,LToe_y,LToe_z';
  const times = Array.from({ length: 250 }, (_, index) => -500 + index * 4);
  const rows = times.map((time, index) => {
    const rightExcursion = index * 2;
    return `1,${time},1400,0,100,100,0,-100,100,0,${100 + rightExcursion},50,0,-100,50`;
  });
  return [header, ...rows].join('\n');
}

describe('Dryad Tendu importer', () => {
  it('unwraps beat-relative events and maps all five phases monotonically', () => {
    const clip = importDryadTenduTrial({
      mocapCsv: motionCsv(),
      movementReferenceCsv: 'ID,Trial,FRS,VL,FL,VR,FRE\n1,1,332,-488,-344,-176,88',
      participantId: 1,
      trial: 1,
    });

    expect(clip.workingSide).toBe('right');
    expect(clip.events.map(event => event.id)).toEqual(['FRS', 'VL', 'FL', 'VR', 'FRE']);
    expect(clip.events.map(event => event.timeUs)).toEqual([0, 180_000, 324_000, 492_000, 756_000]);
    expect(new Set(clip.frames.map(frame => frame.phaseId))).toEqual(new Set([
      'departure', 'extension', 'full_extension', 'return', 'closure',
    ]));
    expect(clip.frames.every((frame, index) => index === 0 || frame.timeUs > clip.frames[index - 1].timeUs)).toBe(true);
    expect(clip.provenance).toMatchObject({
      rightsStatus: 'product_technical_signal_allowed',
      pedagogicalStatus: 'technical_only',
      nicoleReviewStatus: 'not_reviewed',
    });
  });

  it('fails closed for incomplete or malformed trials', () => {
    expect(() => importDryadTenduTrial({
      mocapCsv: 'trial,time\n1,0',
      movementReferenceCsv: 'ID,Trial,FRS,VL,FL,VR,FRE\n1,1,0,1,2,3,4',
      participantId: 1,
      trial: 1,
    })).toThrow();
  });
});

