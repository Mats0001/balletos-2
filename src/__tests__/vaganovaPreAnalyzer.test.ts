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
import {
  approveCueReviewAudit,
  contentFromGroundedDraft,
  createGroundedCueReviewAudit,
  setCueReviewAudience,
} from '../services/cueReviewAudit';
import { cueReviewExpectedState } from '../services/cueReviewAudit';
import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { SelectedSkeletonTarget } from '../types/skeletonTarget';

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
  it('removes pending legacy AI, migrates Nicole decisions fail-closed and preserves teacher/demo records', () => {
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
    expect(result).toHaveLength(6);
    expect(result.slice(0, 4).every(point => (
      point.reviewAudit?.origin.kind === 'legacy_unverified'
      && point.learnerVisible === false
      && point.parentVisible === false
    ))).toBe(true);
    expect(result.slice(0, 3).every(point => point.provenance === undefined)).toBe(true);
    expect(result[3].provenance).toBe('nicole_rejected');
    expect(result.slice(4)).toEqual([teacher, demo]);
    const persisted = JSON.parse(storage.getItem(storageKey) ?? 'null') as VaganovaCuePoint[];
    expect(persisted).toHaveLength(6);
    expect(persisted.slice(0, 4).every(point => point.reviewAudit?.origin.kind === 'legacy_unverified')).toBe(true);
    expect(storage.getItem(`${storageKey}_legacy_backup`)).toContain('confirmed-a');

    const secondRead = vaganovaPreAnalyzer.getCuePoints(videoUrl);
    expect(secondRead).toEqual(result);
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

describe('audited cue persistence guard', () => {
  const target: SelectedSkeletonTarget = {
    targetId: 'bone.sternum_navel', kind: 'bone', anchorNormalized: { x: 0.5, y: 0.4 },
    sourceId: 'audited-video.mp4', streamEpoch: 2, generation: 1, mediaTimeUs: 1_500_000,
    frameStatus: 'exact_cache_frame',
  };
  const evidence: ReadyGroundedTeacherDraft['evidence'] = {
    metricId: 'spine_tilt_aplomb', valueDeg: 3.1, confidence: 0.9, landmarkVisibility: 0.95,
    measurementClass: 'vaganova_relation', heuristicState: 'heuristic_attention',
    sourceId: target.sourceId, streamEpoch: target.streamEpoch, generation: target.generation,
    mediaTimeUs: target.mediaTimeUs, videoWidth: 960, videoHeight: 1280,
    policyVersion: 'policy-v1', source: 'exact_frame_cache',
  };
  const draft: ReadyGroundedTeacherDraft = {
    kind: 'ready', target: 'spine_center', reviewState: 'pending_nicole',
    learnerVisible: false, parentVisible: false, evidence,
    sections: {
      what: 'what', whyConditional: 'why', goalConditional: 'goal',
      practiceForTeacherReview: 'practice', metaphor: 'metaphor', technical: 'technical',
      limitations: 'limitations', sourceRefs: ['source'],
    },
    guide: { kind: 'image_vertical', anchor: 'pelvis_center', label: 'Aplomb-Orientierung (2D) · Nicole prüft', reviewState: 'pending_nicole', evidence },
  };

  it('roundtrips an audited draft and blocks generic mutation, deletion and reset', () => {
    installMemoryStorage();
    const created = vaganovaPreAnalyzer.addGroundedTeacherDraft(target.sourceId, draft, target, 'Plié');
    const audited = created[0];

    expect(audited.reviewAudit?.origin.kind).toBe('grounded_ai_draft');
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)[0].reviewAudit).toEqual(audited.reviewAudit);
    expect(() => vaganovaPreAnalyzer.updateCuePoint(target.sourceId, audited.id, { headline: 'forged' })).toThrow(/typed review/i);
    expect(() => vaganovaPreAnalyzer.deleteCuePoint(target.sourceId, audited.id)).toThrow(/physically deleted/i);
    expect(() => vaganovaPreAnalyzer.resetToDefaults(target.sourceId)).toThrow(/reset/i);
    expect(() => vaganovaPreAnalyzer.saveCuePoints(target.sourceId, [])).toThrow(/remove/i);
    expect(() => vaganovaPreAnalyzer.saveCuePoints(target.sourceId, [{ ...audited, timeSeconds: 99 }])).toThrow(/mutate/i);
    expect(() => vaganovaPreAnalyzer.saveCuePoints(target.sourceId, [audited, audited])).toThrow(/unique/i);
    expect(() => vaganovaPreAnalyzer.addGroundedTeacherDraft('other-video.mp4', draft, target, 'Plié')).toThrow(/exact video source/i);
    const teacher = cue('plain', 'TEACHER_CREATED', 4);
    vaganovaPreAnalyzer.saveCuePoints('plain.mp4', [teacher]);
    expect(() => vaganovaPreAnalyzer.saveCuePoints('plain.mp4', [{ ...teacher, reviewAudit: audited.reviewAudit }])).toThrow(/cannot insert/i);
    expect(() => vaganovaPreAnalyzer.updateCuePoint('plain.mp4', teacher.id, { reviewAudit: audited.reviewAudit } as never)).toThrow(/cannot insert reviewAudit/i);
    expect(() => vaganovaPreAnalyzer.addCuePoint('plain.mp4', { ...teacher, reviewAudit: audited.reviewAudit } as never)).toThrow(/cannot insert reviewAudit/i);
  });

  it('persists approval and audiences but revokes both after a new teacher revision', () => {
    installMemoryStorage();
    const [created] = vaganovaPreAnalyzer.addGroundedTeacherDraft(target.sourceId, draft, target, 'Plié');
    let points = vaganovaPreAnalyzer.transitionReviewedCue(target.sourceId, created.id, 'approve', cueReviewExpectedState(created.reviewAudit!));
    points = vaganovaPreAnalyzer.setReviewedAudience(target.sourceId, created.id, 'learner', true, cueReviewExpectedState(points[0].reviewAudit!));
    points = vaganovaPreAnalyzer.setReviewedAudience(target.sourceId, created.id, 'parent', true, cueReviewExpectedState(points[0].reviewAudit!));
    expect(points[0]).toMatchObject({ learnerVisible: true, parentVisible: true });

    const changed = vaganovaPreAnalyzer.reviseReviewedCue(target.sourceId, created.id, {
      headline: 'Nicoles Revision 2',
    }, cueReviewExpectedState(points[0].reviewAudit!));
    expect(changed[0]).toMatchObject({ learnerVisible: false, parentVisible: false, headline: 'Nicoles Revision 2' });
    expect(changed[0].reviewAudit?.revisions).toHaveLength(2);
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)[0]).toMatchObject({ learnerVisible: false, parentVisible: false });
  });

  it('keeps an audited review byte-identical through automatic replacement', () => {
    const content = contentFromGroundedDraft(draft, target, 'Plié');
    const reviewAudit = createGroundedCueReviewAudit({ draft, target, content });
    const approval = approveCueReviewAudit(reviewAudit, cueReviewExpectedState(reviewAudit));
    const learner = setCueReviewAudience(approval, 'learner', true, cueReviewExpectedState(approval));
    const approved = setCueReviewAudience(learner, 'parent', true, cueReviewExpectedState(learner));
    const reviewed: VaganovaCuePoint = {
      ...cue('audit', 'TEACHER_CREATED', 1.5, 'nicole_confirmed'),
      reviewAudit: approved, learnerVisible: true, parentVisible: true,
    };
    expect(replaceAutoCuePoints([reviewed], [cue('pending', 'KI_AUTO', 4)])).toEqual([reviewed, cue('pending', 'KI_AUTO', 4)]);
  });

  it('fails explicitly on storage write failure instead of showing a false success', () => {
    const storage = installMemoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => vaganovaPreAnalyzer.addGroundedTeacherDraft(target.sourceId, draft, target, 'Plié'))
      .toThrow(/storage write failed.*quota exceeded/i);
  });

  it('fails closed for malformed storage shapes', () => {
    const storage = installMemoryStorage();
    const key = `balletos_cuepoints_v2_${encodeURIComponent(target.sourceId)}`;
    storage.setItem(key, JSON.stringify({ forged: true }));
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)).toEqual([]);
    storage.setItem(key, JSON.stringify([{ id: 'bad', timeSeconds: 'not-a-number' }]));
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)).toEqual([]);
  });

  it('quarantines malformed nested audits without throwing', () => {
    const storage = installMemoryStorage();
    const key = `balletos_cuepoints_v2_${encodeURIComponent(target.sourceId)}`;
    const created = vaganovaPreAnalyzer.addGroundedTeacherDraft(target.sourceId, draft, target, 'Plié');
    const corrupted = JSON.parse(JSON.stringify(created));
    corrupted[0].reviewAudit.events[0] = null;
    storage.setItem(key, JSON.stringify(corrupted));
    expect(() => vaganovaPreAnalyzer.getCuePoints(target.sourceId)).not.toThrow();
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)).toEqual([]);
    expect(storage.getItem(`${key}_audit_quarantine`)).toContain(created[0].id);
  });

  it('quarantines malformed legacy text before migration in the same read', () => {
    const storage = installMemoryStorage();
    const key = `balletos_cuepoints_v2_${encodeURIComponent(target.sourceId)}`;
    const malformed = { ...cue('legacy-malformed', 'KI_AUTO', 2, 'nicole_confirmed'), poseName: { bad: true } };
    storage.setItem(key, JSON.stringify([malformed]));
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)).toEqual([]);
    expect(storage.getItem(`${key}_audit_quarantine`)).toContain('legacy-malformed');
    storage.setItem(key, JSON.stringify([{ ...cue('legacy-note', 'TEACHER_CREATED', 2), kiNote: { bad: true } }]));
    expect(vaganovaPreAnalyzer.getCuePoints(target.sourceId)).toEqual([]);
    expect(storage.getItem(`${key}_audit_quarantine`)).toContain('legacy-note');
  });
});
