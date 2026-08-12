import { describe, expect, it } from 'vitest';
import {
  approveCueReviewAudit,
  canonicalJson,
  contentFromGroundedDraft,
  createGroundedCueReviewAudit,
  createLegacyCueReviewAudit,
  cueReviewAuditIsValid,
  cueReviewExpectedState,
  projectCueReviewAudit,
  rejectCueReviewAudit,
  reopenCueReviewAudit,
  reviseCueReviewAudit,
  setCueReviewAudience,
  sha256Canonical,
} from '../services/cueReviewAudit';
import type { CueReviewCommandContext } from '../types/cueReviewAudit';
import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { SelectedSkeletonTarget } from '../types/skeletonTarget';

function deterministicContext(): CueReviewCommandContext {
  let sequence = 0;
  return {
    actorId: 'nicole-test',
    now: () => `2026-08-12T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    createId: prefix => `${prefix}-${++sequence}`,
  };
}

const target: SelectedSkeletonTarget = {
  targetId: 'bone.sternum_navel', kind: 'bone', anchorNormalized: { x: 0.5, y: 0.4 },
  sourceId: '/videos/nicole_saal_1.mp4', streamEpoch: 8, generation: 3,
  mediaTimeUs: 2_500_000, segmentT: 0.5, frameStatus: 'exact_cache_frame',
};

const evidence: ReadyGroundedTeacherDraft['evidence'] = {
  metricId: 'spine_tilt_aplomb', valueDeg: 4.2, confidence: 0.91,
  measurementClass: 'vaganova_relation', heuristicState: 'heuristic_attention',
  sourceId: target.sourceId, streamEpoch: target.streamEpoch, generation: target.generation,
  mediaTimeUs: target.mediaTimeUs, videoWidth: 960, videoHeight: 1280,
  policyVersion: 'teacher-policy-v1', source: 'exact_frame_cache',
};

const draft: ReadyGroundedTeacherDraft = {
  kind: 'ready', target: 'spine_center', reviewState: 'pending_nicole',
  learnerVisible: false, parentVisible: false,
  evidence,
  sections: {
    what: 'Im Bild ist eine leichte Abweichung sichtbar.',
    whyConditional: 'Falls Aplomb erwartet ist, prüft Nicole die Achse.',
    goalConditional: 'Schulter- und Beckenmitte bewusst beziehen.',
    practiceForTeacherReview: 'Pausieren, vergleichen, erneut ausführen.',
    metaphor: 'Wie ein ruhiger Faden nach oben.',
    technical: '2D-Projektion am exakten Frame.',
    limitations: 'Keine Ursache aus diesem Frame ableiten.',
    sourceRefs: ['exact-cache', 'teacher-policy-v1'],
  },
  guide: {
    kind: 'image_vertical', anchor: 'pelvis_center',
    label: 'Aplomb-Orientierung (2D) · Nicole prüft', reviewState: 'pending_nicole',
    evidence,
  },
};

function createAudit() {
  const context = deterministicContext();
  const content = contentFromGroundedDraft(draft, target, 'Plié – Tiefpunkt');
  return { context, content, audit: createGroundedCueReviewAudit({ draft, target, content, context }) };
}

describe('cue review audit', () => {
  it('canonicalizes key order and changes the digest for relevant content', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
    expect(sha256Canonical({ a: 2 })).not.toBe(sha256Canonical({ a: 1 }));
    expect(sha256Canonical({ a: 1 })).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
    expect(sha256Canonical({ a: 1, b: 2 })).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  });

  it('captures an immutable AI origin and a separate pending Nicole revision', () => {
    const { audit } = createAudit();
    const projection = projectCueReviewAudit(audit);

    expect(cueReviewAuditIsValid(audit)).toBe(true);
    expect(audit.origin.kind).toBe('grounded_ai_draft');
    expect(audit.origin.originalContent).not.toBe(audit.revisions[0].content);
    expect(projection).toMatchObject({
      provenance: 'nicole_draft', learnerVisible: false, parentVisible: false,
      revisionNumber: 1, isApproved: false,
    });
    expect(() => { (audit.origin.originalContent as { headline: string }).headline = 'mutated'; }).toThrow();
  });

  it('approves explicitly, grants audiences only for that revision, and revokes them on edit', () => {
    const { audit, content, context } = createAudit();
    const originBefore = canonicalJson(audit.origin);
    const approved = approveCueReviewAudit(audit, cueReviewExpectedState(audit), context);
    const learnerPublished = setCueReviewAudience(
      approved, 'learner', true, cueReviewExpectedState(approved), context,
    );
    const published = setCueReviewAudience(
      learnerPublished, 'parent', true, cueReviewExpectedState(learnerPublished), context,
    );
    expect(projectCueReviewAudit(published)).toMatchObject({
      isApproved: true, learnerVisible: true, parentVisible: true,
    });

    const edited = reviseCueReviewAudit(published, { headline: 'Nicoles präzisierte Beobachtung' }, cueReviewExpectedState(published), context);
    const projection = projectCueReviewAudit(edited);

    expect(canonicalJson(edited.origin)).toBe(originBefore);
    expect(edited.revisions).toHaveLength(2);
    expect(edited.revisions[0]).toEqual(published.revisions[0]);
    expect(projection).toMatchObject({
      provenance: 'nicole_draft', revisionNumber: 2,
      learnerVisible: false, parentVisible: false, isApproved: false,
    });
    expect(edited.events.filter(item => item.type === 'audience_revoked')).toHaveLength(2);
  });

  it('keeps reject and reopen as ordered events instead of overwriting history', () => {
    const { audit, content, context } = createAudit();
    const rejected = rejectCueReviewAudit(audit, cueReviewExpectedState(audit), context);
    const reopened = reopenCueReviewAudit(rejected, cueReviewExpectedState(rejected), context);

    expect(reopened.events.slice(-2).map(item => item.type)).toEqual(['rejected', 'reopened']);
    expect(projectCueReviewAudit(rejected).provenance).toBe('nicole_rejected');
    expect(projectCueReviewAudit(reopened).provenance).toBe('nicole_draft');
  });

  it('is idempotent for unchanged content and rejects publishing a pending revision', () => {
    const { audit, content, context } = createAudit();
    expect(reviseCueReviewAudit(audit, { headline: content.headline }, cueReviewExpectedState(audit), context)).toBe(audit);
    expect(() => setCueReviewAudience(audit, 'learner', true, cueReviewExpectedState(audit), context)).toThrow(/approved/i);
  });

  it('rejects source/frame mismatch and detects stored origin or revision tampering', () => {
    const { audit, content, context } = createAudit();
    expect(() => createGroundedCueReviewAudit({
      draft,
      target: { ...target, sourceId: '/videos/other.mp4' },
      content,
      context,
    })).toThrow(/identity/i);

    const stored = JSON.parse(JSON.stringify(audit));
    expect(cueReviewAuditIsValid(stored)).toBe(true);
    stored.origin.originalContent.headline = 'forged origin';
    expect(cueReviewAuditIsValid(stored)).toBe(false);

    const storedRevision = JSON.parse(JSON.stringify(audit));
    storedRevision.revisions[0].content.headline = 'forged teacher revision';
    expect(cueReviewAuditIsValid(storedRevision)).toBe(false);

    const storedEvent = JSON.parse(JSON.stringify(approveCueReviewAudit(audit, cueReviewExpectedState(audit), context)));
    expect(cueReviewAuditIsValid(storedEvent)).toBe(true);
    storedEvent.events[1].type = 'rejected';
    expect(cueReviewAuditIsValid(storedEvent)).toBe(false);
  });

  it('requires a fresh audience grant after reject, reopen and re-approval', () => {
    const { audit, context } = createAudit();
    const approved = approveCueReviewAudit(audit, cueReviewExpectedState(audit), context);
    const granted = setCueReviewAudience(approved, 'learner', true, cueReviewExpectedState(approved), context);
    const reopened = reopenCueReviewAudit(granted, cueReviewExpectedState(granted), context);
    const reapproved = approveCueReviewAudit(reopened, cueReviewExpectedState(reopened), context);
    expect(projectCueReviewAudit(reapproved)).toMatchObject({ isApproved: true, learnerVisible: false });
  });

  it('binds revision actor, time and version and rejects a stale command token', () => {
    const { audit, content, context } = createAudit();
    for (const field of ['actorId', 'createdAt', 'contentVersion'] as const) {
      const stored = JSON.parse(JSON.stringify(audit));
      stored.revisions[0][field] = field === 'contentVersion' ? 99 : 'forged';
      expect(cueReviewAuditIsValid(stored)).toBe(false);
    }
    const stale = cueReviewExpectedState(audit);
    const rejected = rejectCueReviewAudit(audit, stale, context);
    expect(() => reopenCueReviewAudit(rejected, stale, context)).toThrow(/changed since/i);
    expect(() => approveCueReviewAudit(rejected, cueReviewExpectedState(rejected), context)).toThrow(/pending review/i);
    expect(() => reviseCueReviewAudit(audit, { jointFocusId: 'right_knee' } as never, cueReviewExpectedState(audit), context)).toThrow(/forbidden/i);
    expect(() => reviseCueReviewAudit(audit, { referenceImageKey: 'unknown' }, cueReviewExpectedState(audit), context)).toThrow(/unknown reference/i);
    const archivedFlip = { ...JSON.parse(JSON.stringify(audit)), archived: true };
    expect(cueReviewAuditIsValid(archivedFlip)).toBe(false);
    const malformedOptional = JSON.parse(JSON.stringify(audit));
    malformedOptional.revisions[0].content.diagnosisText = { bad: true };
    expect(cueReviewAuditIsValid(malformedOptional)).toBe(false);
    const legacy = createLegacyCueReviewAudit({
      recordId: 'legacy', videoSourceId: 'video', mediaTimeUs: 1, targetId: 'spine_center',
      originalContent: { ...content, headline: { bad: true } } as never,
      currentContent: content, legacyPayload: {}, wasRejected: false, context,
    });
    expect(cueReviewAuditIsValid(legacy)).toBe(false);
  });
});
