import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaganovaAngleCalculator } from '../services/vaganovaAngleCalculator';
import { canGenerateLegacyUngroundedCues } from '../config/buildPolicy';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import {
  VaganovaCuePoint,
  analyzeFrameCacheForHighlights,
  buildNeutralManualCueSuggestion,
  findAddedCuePoint,
  replaceAutoCuePoints,
  vaganovaPreAnalyzer,
} from '../services/vaganovaPreAnalyzer';

function installMemoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

function cue(
  id: string,
  dataSource: NonNullable<VaganovaCuePoint['dataSource']>,
  timeSeconds: number,
  provenance?: VaganovaCuePoint['provenance'],
): VaganovaCuePoint {
  return {
    id,
    timeSeconds,
    timecodeStr: '00:00.000',
    poseName: id,
    status: 'CORRECTION',
    headline: id,
    cueMetaphor: id,
    jointFocusId: 'right_knee',
    dataSource,
    provenance,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('legacy automatic claim gate', () => {
  it('requires every hard claim policy and is disabled in this build', () => {
    expect(canGenerateLegacyUngroundedCues()).toBe(false);
  });

  it('returns no cues or report before reading frames or calculating metrics', () => {
    const frameSpy = vi.spyOn(vaganovaFrameCache, 'getFrames');
    const calculatorSpy = vi.spyOn(VaganovaAngleCalculator.prototype, 'analyzeFullFrame');

    const result = analyzeFrameCacheForHighlights('unsupported-legacy-claims.mp4');

    expect(result).toEqual({ autoCuePoints: [], report: null });
    expect(frameSpy).not.toHaveBeenCalled();
    expect(calculatorSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/Knie|Valgus|Muskel|Ursache|Diagnose|Prognose|Hausaufgabe/i);
  });

  it('builds a claim-free neutral teacher marker', () => {
    expect(buildNeutralManualCueSuggestion('Grand Plié')).toEqual({
      headline: 'Beobachtungspunkt – Grand Plié',
      status: 'NEUTRAL',
      diagnosisText: '',
      goalText: '',
      practiceText: '',
    });
  });
});

describe('stored cue safety migration', () => {
  it('removes unreviewed legacy AI while preserving every Nicole, teacher and demo record', () => {
    const storage = installMemoryStorage();
    const videoUrl = 'migration-source.mp4';
    const storageKey = `balletos_cuepoints_v2_${encodeURIComponent(videoUrl)}`;
    const confirmedA = cue('confirmed-a', 'KI_AUTO', 1, 'nicole_confirmed');
    const confirmedB = cue('confirmed-b', 'KI_AUTO', 1, 'nicole_confirmed');
    const edited = cue('edited', 'KI_AUTO', 2, 'nicole_edited');
    const rejected = cue('rejected', 'KI_AUTO', 3, 'nicole_rejected');
    const teacher = cue('teacher', 'TEACHER_CREATED', 4);
    const demo = cue('demo', 'DEMO_FIXTURE', 5);
    const pending = cue('pending', 'KI_AUTO', 6, 'ki_suggestion');
    const unversioned = cue('unversioned', 'KI_AUTO', 7);
    const invalid = { ...cue('invalid', 'KI_AUTO', 8), provenance: 'unknown_runtime_value' };
    storage.setItem(storageKey, JSON.stringify([
      confirmedA,
      confirmedB,
      edited,
      rejected,
      teacher,
      demo,
      pending,
      unversioned,
      invalid,
    ]));

    const result = vaganovaPreAnalyzer.getCuePoints(videoUrl);
    const expected = [confirmedA, confirmedB, edited, rejected, teacher, demo];

    expect(result).toEqual(expected);
    expect(JSON.parse(storage.getItem(storageKey) ?? 'null')).toEqual(expected);
  });

  it('keeps rich demo fixtures explicit and externally unpublished', () => {
    installMemoryStorage();

    const result = vaganovaPreAnalyzer.getCuePoints('/videos/IMG_2272.mp4');

    expect(result).toHaveLength(2);
    expect(result.every(point => (
      point.dataSource === 'DEMO_FIXTURE'
      && point.isDemoFixture === true
      && point.learnerVisible === false
      && point.parentVisible === false
    ))).toBe(true);
    expect(result[1].diagnosisMetaphor).toMatch(/einknicke Brücke/i);
    expect(result[1].practiceText).toMatch(/demi-plié/i);
  });

  it('falls back to the marked demo after removing a stale pending result', () => {
    const storage = installMemoryStorage();
    const videoUrl = '/videos/IMG_2272.mp4';
    const storageKey = `balletos_cuepoints_v2_${encodeURIComponent(videoUrl)}`;
    storage.setItem(storageKey, JSON.stringify([
      cue('stale-pending', 'KI_AUTO', 1, 'ki_suggestion'),
    ]));

    const result = vaganovaPreAnalyzer.getCuePoints(videoUrl);

    expect(result).toHaveLength(2);
    expect(result.every(point => point.isDemoFixture)).toBe(true);
    expect(JSON.parse(storage.getItem(storageKey) ?? 'null')).toEqual([]);
  });

  it('returns no fabricated content for an unknown video', () => {
    installMemoryStorage();
    expect(vaganovaPreAnalyzer.getCuePoints('unknown-school-video.mp4')).toEqual([]);
  });

  it('identifies an earlier new marker without altering a later existing cue', () => {
    installMemoryStorage();
    const videoUrl = 'sorted-markers.mp4';
    const existing = cue('existing-at-five', 'TEACHER_CREATED', 5);
    vaganovaPreAnalyzer.saveCuePoints(videoUrl, [existing]);
    const before = vaganovaPreAnalyzer.getCuePoints(videoUrl);

    const updated = vaganovaPreAnalyzer.addCuePoint(videoUrl, {
      timeSeconds: 1,
      timecodeStr: '00:01.000',
      poseName: 'New neutral marker',
      status: 'NEUTRAL',
      headline: 'Beobachtungspunkt',
      cueMetaphor: '',
      jointFocusId: 'pelvis_core',
    });
    const added = findAddedCuePoint(before, updated);

    expect(added).toMatchObject({ timeSeconds: 1, status: 'NEUTRAL' });
    expect(updated.find(point => point.id === existing.id)).toEqual(existing);
  });
});

describe('replaceAutoCuePoints', () => {
  it('removes stale unreviewed AI cues even when the next scan is empty', () => {
    const teacher = cue('teacher', 'TEACHER_CREATED', 2);
    const demo = cue('demo', 'DEMO_FIXTURE', 3);
    const stale = cue('stale-ai-knee', 'KI_AUTO', 1);

    expect(replaceAutoCuePoints([stale, teacher, demo], [])).toEqual([teacher, demo]);
  });

  it('preserves Nicole-reviewed provenance and replaces only pending AI results', () => {
    const confirmed = cue('confirmed', 'KI_AUTO', 1, 'nicole_confirmed');
    const edited = cue('edited', 'KI_AUTO', 2, 'nicole_edited');
    const rejected = cue('rejected', 'KI_AUTO', 3, 'nicole_rejected');
    const pending = cue('pending', 'KI_AUTO', 4, 'ki_suggestion');
    const generated = cue('new-ai', 'KI_AUTO', 5);

    expect(replaceAutoCuePoints([confirmed, edited, rejected, pending], [generated]))
      .toEqual([confirmed, edited, rejected, generated]);
  });

  it('does not recreate a suggestion at a reviewed or rejected cue position', () => {
    const confirmed = cue('confirmed', 'KI_AUTO', 1, 'nicole_confirmed');
    const rejected = cue('rejected', 'KI_AUTO', 3, 'nicole_rejected');
    const edited = cue('edited', 'TEACHER_CREATED', 4, 'nicole_edited');
    const duplicateConfirmed = cue('regenerated-confirmed', 'KI_AUTO', 1);
    const duplicateRejected = cue('regenerated-rejected', 'KI_AUTO', 3);
    const duplicateEdited = cue('regenerated-edited', 'KI_AUTO', 4);

    expect(replaceAutoCuePoints(
      [confirmed, rejected, edited],
      [duplicateConfirmed, duplicateRejected, duplicateEdited],
    )).toEqual([confirmed, rejected, edited]);
  });
});
