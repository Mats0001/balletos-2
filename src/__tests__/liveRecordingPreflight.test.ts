import { describe, expect, it } from 'vitest';
import { evaluateLiveRecordingPreflight, type LivePreflightObservation } from '../services/liveRecordingPreflight';
import type { PoseLandmark } from '../services/realMediaPipePose';

function pose(visibility = 0.96, scale = 1): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  const set = (index: number, x: number, y: number) => { landmarks[index] = { x, y, z: 0, visibility }; };
  set(0, .5, .08); set(11, .35, .25); set(12, .65, .25); set(13, .28, .38); set(14, .72, .38);
  set(15, .2, .5); set(16, .8, .5); set(23, .4, .52); set(24, .6, .52); set(25, .4, .7); set(26, .6, .7);
  set(27, .4, .88); set(28, .6, .88); set(31, .36, .94); set(32, .64, .94);
  if (scale !== 1) {
    for (const point of landmarks) {
      point.x = .5 + (point.x - .5) * scale;
      point.y = .5 + (point.y - .5) * scale;
    }
  }
  return landmarks;
}

function observations(count: number, options: Partial<LivePreflightObservation> = {}): LivePreflightObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    atMs: index * 280,
    landmarks: pose(),
    sharpnessScore: .25,
    cameraMotionScore: index === 0 ? null : .03,
    ...options,
  }));
}

describe('live recording preflight', () => {
  it('progresses from checking to ready for a stable full-body recording', () => {
    expect(evaluateLiveRecordingPreflight({ observations: observations(3), exerciseLabel: 'Battement Tendu' }))
      .toMatchObject({ status: 'checking', progress: 0.375 });
    const result = evaluateLiveRecordingPreflight({ observations: observations(8), exerciseLabel: 'Battement Tendu' });
    expect(result.status).toBe('ready');
    expect(result.checks.every(check => check.state === 'pass')).toBe(true);
    expect(result.nextAction).toBe('Tendu einmal vollständig ausführen.');
  });

  it('names the selected technical phase pilot instead of hard-coding Tendu', () => {
    const result = evaluateLiveRecordingPreflight({ observations: observations(8), exerciseLabel: 'Passé' });

    expect(result.status).toBe('ready');
    expect(result.nextAction).toBe('Passé einmal vollständig ausführen.');
  });

  it('allows ordinary classroom imperfections as evidence notes instead of an endless abort', () => {
    const frames = observations(8).map((observation, index) => ({
      ...observation,
      sharpnessScore: .04,
      cameraMotionScore: index === 0 ? null : .2,
      landmarks: pose(index < 4 ? .5 : .96),
    }));
    const result = evaluateLiveRecordingPreflight({ observations: frames, exerciseLabel: 'Battement Tendu' });
    expect(result.status).toBe('ready_with_notes');
    expect(result.checks.some(check => check.state === 'note')).toBe(true);
    expect(result.checks.every(check => !check.blocksStart)).toBe(true);
    expect(result.nextAction).not.toMatch(/abbrechen/i);
  });

  it('blocks only when there is no defensible technical recording', () => {
    const result = evaluateLiveRecordingPreflight({
      observations: observations(8, { landmarks: [], sharpnessScore: .005, cameraMotionScore: .9 }),
      exerciseLabel: '',
    });
    expect(result.status).toBe('needs_correction');
    expect(result.checks.filter(check => check.blocksStart).map(check => check.id))
      .toEqual(expect.arrayContaining(['exercise', 'pose', 'full_body', 'feet', 'person_size', 'sharpness', 'camera']));
  });
});
