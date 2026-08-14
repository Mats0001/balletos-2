import { describe, expect, it } from 'vitest';
import {
  approveCueReviewAudit,
  canonicalJson,
  contentFromGroundedDraft,
  contentFromNicoleProDraft,
  createGroundedCueReviewAudit,
  createLegacyCueReviewAudit,
  createNicoleProCueReviewAudit,
  createNicoleProStudentDerivation,
  cueReviewContentIsAudienceSafe,
  cueReviewAuditIsValid,
  cueReviewExpectedState,
  projectCueReviewAudit,
  projectCueReviewForAudience,
  projectCurrentStudentDerivation,
  projectNicoleProClaimReviews,
  nicoleProStudentDerivationReadiness,
  rejectCueReviewAudit,
  reopenCueReviewAudit,
  reviseCueReviewAudit,
  reviewNicoleProClaim,
  setCueReviewAudience,
  sha256Canonical,
} from '../services/cueReviewAudit';
import type { CueReviewCommandContext } from '../types/cueReviewAudit';
import { bindAssessmentIfCurrent, createAnalysisContextEpoch } from '../services/analysisContextGuard';
import {
  createNicoleProExactFrameArtifactId,
  createNicoleProDraftId,
  NICOLE_PRO_LANDMARK_MODEL_V1,
  planNicoleProGroundedDraft,
} from '../services/nicoleProContentPlanner';
import {
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE,
  resolveNicoleProTrustedKnowledgeRegistry,
  validateStoredNicoleProDraft,
} from '../services/nicoleProContentValidator';
import { planNicoleAnatomyForNicoleProDraft } from '../services/nicoleProAnatomyPlanner';
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
  metricId: 'spine_tilt_aplomb', valueDeg: 4.2, confidence: 0.91, landmarkVisibility: 0.95,
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

function createNicoleProFixture() {
  const currentContext = createAnalysisContextEpoch({
    schemaVersion: 1,
    sourceId: target.sourceId,
    studentId: 'student:emma-berger',
    exerciseId: 'plie',
    levelId: 'minis',
  }, 3);
  const groundedAssessment = bindAssessmentIfCurrent(currentContext, currentContext, draft);
  if (!groundedAssessment) throw new Error('Test assessment must bind to the current context.');
  const proDraft = planNicoleProGroundedDraft({
    groundedAssessment,
    currentContext,
    analysisArtifactId: createNicoleProExactFrameArtifactId(
      currentContext, evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
    ),
    view: 'frontal',
    landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
    captureQuality: 'ready',
    draftId: createNicoleProDraftId(
      currentContext,
      evidence.mediaTimeUs,
      NICOLE_PRO_LANDMARK_MODEL_V1,
      evidence.metricId,
      evidence.policyVersion,
    ),
    generatedAt: '2026-08-13T20:00:00.000Z',
  });
  if (!proDraft) throw new Error('Test Nicole-Pro draft must be planned.');
  const anatomyBundle = planNicoleAnatomyForNicoleProDraft({
    draft: proDraft,
    currentContext,
  });
  if (!anatomyBundle) throw new Error('Test Anatomy-Pro bundle must be planned.');
  const context = deterministicContext();
  const content = contentFromNicoleProDraft(proDraft, 'Plié – Tiefpunkt');
  const audit = createNicoleProCueReviewAudit({
    draft: proDraft,
    anatomyBundle,
    target,
    poseName: content.poseName,
    currentContext,
    context,
  });
  return { audit, anatomyBundle, content, context, currentContext, proDraft };
}

function reviewAndDeriveStudentCopy() {
  const { audit, context, ...fixture } = createNicoleProFixture();
  const requiredTypes = new Set([
    'visual_observation', 'teaching_target', 'immediate_cue',
    'practice', 'success_criterion', 'metaphor',
  ]);
  let reviewed = audit;
  for (const claim of fixture.proDraft.claims) {
    if (!requiredTypes.has(claim.type)) continue;
    reviewed = reviewNicoleProClaim(
      reviewed, claim.claimId, 'accepted', undefined, true,
      cueReviewExpectedState(reviewed), context,
    );
  }
  const approved = approveCueReviewAudit(reviewed, cueReviewExpectedState(reviewed), context);
  const selectedReviewIds = projectNicoleProClaimReviews(approved)
    .filter(item => item.selectedForStudentDerivation && item.eventId)
    .map(item => item.eventId!);
  const derived = createNicoleProStudentDerivation(
    approved, selectedReviewIds, cueReviewExpectedState(approved), context,
  );
  return { audit, context, reviewed, approved, derived, ...fixture };
}

function redigestStoredEvents(stored: any): void {
  let previous: string | null = null;
  for (const auditEvent of stored.events) {
    auditEvent.previousEventDigest = previous;
    const core = Object.fromEntries(Object.entries(auditEvent).filter(
      ([key]) => key !== 'eventDigest' && key !== 'digestAlgorithm',
    ));
    auditEvent.eventDigest = sha256Canonical(core);
    previous = auditEvent.eventDigest;
  }
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

  it('captures the complete Nicole-Pro draft and rule versions as an immutable origin', () => {
    const { audit, anatomyBundle, content, context, currentContext, proDraft } = createNicoleProFixture();
    const payload = audit.origin.nicoleProPayload;

    expect(cueReviewAuditIsValid(audit)).toBe(true);
    expect(audit.origin.kind).toBe('nicole_pro_draft');
    expect(payload?.draft).toEqual(proDraft);
    expect(payload?.anatomyBundle).toEqual(anatomyBundle);
    expect(Object.isFrozen(payload?.anatomyBundle?.knowledgeItems[0])).toBe(true);
    expect(payload?.knowledgeRegistryVersion).toBe('1.3.0');
    expect(payload?.ruleVersions).toEqual([
      { ruleId: 'knowledge:spine-aplomb:teacher-v1', version: '1.2.0' },
    ]);
    expect(projectCueReviewAudit(audit)).toMatchObject({
      provenance: 'nicole_draft', learnerVisible: false, parentVisible: false,
      revisionNumber: 1, isApproved: false,
    });
    expect(projectCueReviewForAudience(audit, 'learner')).toBeNull();
    expect(() => { (payload!.draft as { draftId: string }).draftId = 'forged'; }).toThrow();

    const priorVersionWithoutAnatomy = createNicoleProCueReviewAudit({
      draft: proDraft,
      target,
      poseName: content.poseName,
      currentContext,
      context,
    });
    expect(cueReviewAuditIsValid(priorVersionWithoutAnatomy)).toBe(true);
    expect(priorVersionWithoutAnatomy.origin.nicoleProPayload?.anatomyBundle).toBeUndefined();
    expect(() => createNicoleProCueReviewAudit({
      draft: proDraft,
      anatomyBundle: null as never,
      target,
      poseName: content.poseName,
      currentContext,
      context,
    })).toThrow(/exact-frame origin/i);
  });

  it('publishes only the narrow approved current revision and revokes it after an edit', () => {
    const { audit, derived: approved, context } = reviewAndDeriveStudentCopy();
    const granted = setCueReviewAudience(
      approved, 'learner', true, cueReviewExpectedState(approved), context,
    );
    const audienceProjection = projectCueReviewForAudience(granted, 'learner');

    expect(audienceProjection).toMatchObject({
      recordId: audit.recordId,
      revisionId: audit.currentRevisionId,
      audience: 'learner',
    });
    expect(audienceProjection?.headline).toContain('Rumpfachse');
    expect(audienceProjection).not.toHaveProperty('diagnosisText');
    expect(audienceProjection).not.toHaveProperty('technicalAnalysis');
    expect(audienceProjection).not.toHaveProperty('reviewAudit');
    expect(projectCueReviewForAudience(granted, 'parent')).toBeNull();

    const revised = reviseCueReviewAudit(
      granted, { headline: 'Nicoles präzisierte Rumpfbeobachtung' },
      cueReviewExpectedState(granted), context,
    );
    expect(projectCueReviewForAudience(revised, 'learner')).toBeNull();
    expect(revised.origin).toEqual(audit.origin);
  });

  it('reviews immutable Pro claims append-only and derives exactly six selected outward claim types', () => {
    const { audit, derived, proDraft } = reviewAndDeriveStudentCopy();
    const claimReviews = projectNicoleProClaimReviews(derived);
    const studentDerivation = projectCurrentStudentDerivation(derived);

    expect(derived.origin).toEqual(audit.origin);
    expect(claimReviews.filter(item => item.selectedForStudentDerivation)).toHaveLength(6);
    expect(nicoleProStudentDerivationReadiness(derived)).toMatchObject({ ready: true, requiredClaims: 6 });
    expect(studentDerivation?.claimReviewEventIds).toHaveLength(6);
    expect(studentDerivation?.content).toMatchObject({
      poseName: 'Plié – Tiefpunkt',
    });
    expect(studentDerivation?.content.headline).toBe(
      proDraft.claims.find(item => item.type === 'visual_observation')?.text,
    );
    const serialized = canonicalJson(studentDerivation?.content);
    expect(serialized).not.toMatch(/teacher_hypothesis|differentiation_test|metric_observation|evidenceId/i);
  });

  it('binds audience grants to the exact current student derivation and invalidates it after a claim edit', () => {
    const { derived, context } = reviewAndDeriveStudentCopy();
    const granted = setCueReviewAudience(
      derived, 'learner', true, cueReviewExpectedState(derived), context,
    );
    expect(projectCueReviewAudit(granted).learnerVisible).toBe(true);
    const selected = projectNicoleProClaimReviews(granted).find(item => item.selectedForStudentDerivation)!;
    const changed = reviewNicoleProClaim(
      granted, selected.claim.claimId, 'edited', 'Im Bild bleibt die Organisation klar sichtbar.', true,
      cueReviewExpectedState(granted), context,
    );
    expect(projectCueReviewAudit(changed).learnerVisible).toBe(false);
    expect(projectCurrentStudentDerivation(changed)).toBeNull();
    expect(projectCueReviewForAudience(changed, 'learner')).toBeNull();
  }, 15_000);

  it('blocks teacher-only, rejected, duplicate or unsafe claim selections from student derivation', () => {
    const { audit, context, proDraft } = createNicoleProFixture();
    const hypothesis = proDraft.claims.find(item => item.type === 'teacher_hypothesis')!;
    expect(() => reviewNicoleProClaim(
      audit, hypothesis.claimId, 'accepted', undefined, true,
      cueReviewExpectedState(audit), context,
    )).toThrow(/teacher-only/i);
    const visual = proDraft.claims.find(item => item.type === 'visual_observation')!;
    expect(() => reviewNicoleProClaim(
      audit, visual.claimId, 'rejected', undefined, true,
      cueReviewExpectedState(audit), context,
    )).toThrow(/rejected claim/i);
    const unsafe = reviewNicoleProClaim(
      audit, visual.claimId, 'edited', 'Du hast Skoliose.', true,
      cueReviewExpectedState(audit), context,
    );
    const approved = approveCueReviewAudit(unsafe, cueReviewExpectedState(unsafe), context);
    const eventId = projectNicoleProClaimReviews(approved).find(item => item.claim.claimId === visual.claimId)!.eventId!;
    expect(() => createNicoleProStudentDerivation(
      approved, [eventId, eventId], cueReviewExpectedState(approved), context,
    )).toThrow(/unique/i);

    const complete = reviewAndDeriveStudentCopy();
    const currentVisual = projectNicoleProClaimReviews(complete.derived)
      .find(item => item.claim.type === 'visual_observation')!;
    const unsafeComplete = reviewNicoleProClaim(
      complete.derived, currentVisual.claim.claimId, 'edited', 'Du hast Skoliose.', true,
      cueReviewExpectedState(complete.derived), complete.context,
    );
    const selected = projectNicoleProClaimReviews(unsafeComplete)
      .filter(item => item.selectedForStudentDerivation && item.eventId)
      .map(item => item.eventId!);
    expect(() => createNicoleProStudentDerivation(
      unsafeComplete, selected, cueReviewExpectedState(unsafeComplete), complete.context,
    )).toThrow(/not safe/i);
  });

  it('rejects recomputed claim, derivation and grant tampering on reload', () => {
    const { derived, context } = reviewAndDeriveStudentCopy();
    const granted = setCueReviewAudience(derived, 'learner', true, cueReviewExpectedState(derived), context);
    expect(cueReviewAuditIsValid(granted)).toBe(true);
    for (const mutate of [
      (stored: any) => { stored.events.find((item: any) => item.type === 'claim_reviewed').claimReview.selectedForStudentDerivation = false; },
      (stored: any) => {
        const derivation = stored.events.find((item: any) => item.type === 'student_derivation_created').studentDerivation;
        derivation.content.headline = 'forged';
        derivation.derivationDigest = sha256Canonical(Object.fromEntries(
          Object.entries(derivation).filter(([key]) => key !== 'derivationDigest'),
        ));
      },
      (stored: any) => { stored.events.find((item: any) => item.type === 'audience_granted').studentDerivationRef.derivationDigest = 'f'.repeat(64); },
    ]) {
      const stored = JSON.parse(JSON.stringify(granted));
      mutate(stored);
      redigestStoredEvents(stored);
      expect(cueReviewAuditIsValid(stored)).toBe(false);
    }
  });

  it('rejects a derivation-bound audience grant moved before its derivation', () => {
    const { derived, context } = reviewAndDeriveStudentCopy();
    const granted = setCueReviewAudience(
      derived, 'learner', true, cueReviewExpectedState(derived), context,
    );
    const stored = JSON.parse(JSON.stringify(granted));
    const derivationIndex = stored.events.findIndex((item: any) => item.type === 'student_derivation_created');
    const grantIndex = stored.events.findIndex((item: any) => item.type === 'audience_granted');
    expect(derivationIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(derivationIndex);
    [stored.events[derivationIndex], stored.events[grantIndex]] = [
      stored.events[grantIndex], stored.events[derivationIndex],
    ];
    stored.events.forEach((item: any, index: number) => { item.eventSequence = index + 1; });
    redigestStoredEvents(stored);

    expect(cueReviewAuditIsValid(stored)).toBe(false);
  });

  it('binds a stored derivation to the exact actor and canonical event timestamp', () => {
    const { derived } = reviewAndDeriveStudentCopy();
    for (const mutate of [
      (studentDerivation: any) => { studentDerivation.actorId = 'forged-actor'; },
      (studentDerivation: any) => { studentDerivation.createdAt = '2026-08-12T12:59:59.000Z'; },
    ]) {
      const stored = JSON.parse(JSON.stringify(derived));
      const derivationEvent = stored.events.find((item: any) => item.type === 'student_derivation_created');
      mutate(derivationEvent.studentDerivation);
      derivationEvent.studentDerivation.derivationDigest = sha256Canonical(Object.fromEntries(
        Object.entries(derivationEvent.studentDerivation).filter(([key]) => key !== 'derivationDigest'),
      ));
      redigestStoredEvents(stored);

      expect(cueReviewAuditIsValid(stored)).toBe(false);
    }
  });

  it('blocks clinical or injury language from every audience projection', () => {
    const { audit, context } = createNicoleProFixture();
    const unsafe = reviseCueReviewAudit(
      audit,
      { headline: 'Eine Rotatorenmanschetten-Läsion ist die Diagnose.' },
      cueReviewExpectedState(audit),
      context,
    );
    const approved = approveCueReviewAudit(unsafe, cueReviewExpectedState(unsafe), context);
    expect(() => setCueReviewAudience(
      approved, 'learner', true, cueReviewExpectedState(approved), context,
    )).toThrow(/student derivation/i);
    expect(projectCueReviewForAudience(approved, 'learner')).toBeNull();
  });

  it.each([
    'Du hast Skoliose.',
    'Dein Gluteus medius ist schwach.',
    'Deine Bauchmuskeln sind zu schwach.',
    'Die Adduktoren sind verkürzt.',
    'Die Hüftmuskulatur ist zu kurz.',
    'Ein Meniskusschaden ist die Ursache.',
    'Dein Kreuzband ist geschädigt.',
    'Deine Patellasehne ist gerissen.',
    'Dein Oberschenkelmuskel ist zu schwach.',
    'Du hast Osteoporose.',
    'Dein Knochen ist gebrochen.',
    'Deine Sehne ist eingerissen.',
    'Dein Muskel ist gerissen.',
    'Dein Gelenk ist krank.',
    'Dein vorderes Kreuzband ist kaputt.',
    'Deine Patellasehne ist beschädigt.',
    'Du hast einen Muskelriss.',
    'Dein Muskel hat einen Faserriss.',
    'Dein Muskel hat zu wenig Kraft.',
    'Dein Muskel hat nicht genug Kraft.',
    'Dein Muskel ist kraftlos.',
    'Du hast einen Muskelfaser Riss.',
    'Du hast einen Faserriss.',
    'Die Achse weicht um 50 Grad ab.',
    'Diese Übung ist immer sicher.',
  ])('rejects unsafe audience wording: %s', headline => {
    const { content } = createNicoleProFixture();
    expect(cueReviewContentIsAudienceSafe({ ...content, headline })).toBe(false);
  });

  it('keeps an ordinary visual ballet cue eligible for student derivation', () => {
    const { content } = createNicoleProFixture();
    for (const headline of [
      'Dein Knie bleibt über dem zweiten Zeh.',
      'Vom Schulterblatt läuft ein Seidenband bis zur Hand.',
      'Der sichtbare Umriss bleibt während der Bewegung ruhig.',
    ]) {
      expect(cueReviewContentIsAudienceSafe({ ...content, headline })).toBe(true);
    }
  });

  it('requires a separate student derivation after outward teacher copy changes', () => {
    const { audit, context } = createNicoleProFixture();
    const revised = reviseCueReviewAudit(
      audit,
      { goalText: 'Nicoles neue, intern geprüfte Zielformulierung.' },
      cueReviewExpectedState(audit),
      context,
    );
    const approved = approveCueReviewAudit(revised, cueReviewExpectedState(revised), context);
    expect(() => setCueReviewAudience(
      approved, 'learner', true, cueReviewExpectedState(approved), context,
    )).toThrow(/student derivation/i);
  });

  it('rejects tampered Nicole-Pro payloads and mismatched exact targets', () => {
    const { audit, content, proDraft, context, currentContext } = createNicoleProFixture();
    const tamperedDraft = JSON.parse(JSON.stringify(audit));
    tamperedDraft.origin.nicoleProPayload.draft.claims[0].text = 'erfundener Befund';
    const { originDigest: _oldDigest, digestAlgorithm: _algorithm, ...tamperedOriginCore } = tamperedDraft.origin;
    tamperedDraft.origin.originDigest = sha256Canonical(tamperedOriginCore);
    expect(cueReviewAuditIsValid(tamperedDraft)).toBe(false);
    const tamperedRegistry = JSON.parse(JSON.stringify(audit));
    tamperedRegistry.origin.nicoleProPayload.knowledgeRegistryVersion = '99.0.0';
    expect(cueReviewAuditIsValid(tamperedRegistry)).toBe(false);
    const tamperedAnatomy = JSON.parse(JSON.stringify(audit));
    tamperedAnatomy.origin.nicoleProPayload.anatomyBundle.knowledgeItems[0].statement = 'Iliopsoas ist sicher die alleinige Ursache.';
    const { originDigest: _anatomyDigest, digestAlgorithm: _anatomyAlgorithm, ...tamperedAnatomyCore } = tamperedAnatomy.origin;
    tamperedAnatomy.origin.originDigest = sha256Canonical(tamperedAnatomyCore);
    expect(cueReviewAuditIsValid(tamperedAnatomy)).toBe(false);
    expect(() => createNicoleProCueReviewAudit({
      draft: proDraft,
      target: { ...target, sourceId: '/videos/other.mp4' },
      poseName: content.poseName,
      currentContext,
      context,
    })).toThrow(/exact-frame origin/i);
  });

  it('rejects a foreign pose model after every local storage digest is recomputed', () => {
    const { audit, proDraft } = createNicoleProFixture();
    const foreignModel = { modelId: 'unapproved-pose-model', modelVersion: '99.0' };
    const foreignDraft = JSON.parse(JSON.stringify(proDraft));
    foreignDraft.evidence[0].landmarkQuality.modelId = foreignModel.modelId;
    foreignDraft.evidence[0].landmarkQuality.modelVersion = foreignModel.modelVersion;
    foreignDraft.evidence[0].analysisArtifactId = createNicoleProExactFrameArtifactId(
      createNicoleProFixture().currentContext,
      foreignDraft.evidence[0].mediaTimeUs,
      foreignModel,
    );
    expect(validateStoredNicoleProDraft(
      foreignDraft,
      'balletos-nicole-pro-knowledge',
      '1.2.0',
    ).valid).toBe(false);

    const forged = JSON.parse(JSON.stringify(audit));
    forged.origin.nicoleProPayload.draft = foreignDraft;
    forged.origin.originalContent = contentFromNicoleProDraft(
      foreignDraft,
      forged.origin.originalContent.poseName,
    );
    const { originDigest: _originDigest, digestAlgorithm: _originAlgorithm, ...originCore } = forged.origin;
    forged.origin.originDigest = sha256Canonical(originCore);
    forged.revisions[0].content = forged.origin.originalContent;
    forged.revisions[0].contentDigest = sha256Canonical(forged.revisions[0].content);
    const { revisionDigest: _revisionDigest, ...revisionCore } = forged.revisions[0];
    forged.revisions[0].revisionDigest = sha256Canonical(revisionCore);
    forged.events[0].revisionDigest = forged.revisions[0].revisionDigest;
    const { eventDigest: _eventDigest, digestAlgorithm: _eventAlgorithm, ...eventCore } = forged.events[0];
    forged.events[0].eventDigest = sha256Canonical(eventCore);
    expect(cueReviewAuditIsValid(forged)).toBe(false);
  });

  it('keeps the stored knowledge version in an immutable product archive', () => {
    const archived = resolveNicoleProTrustedKnowledgeRegistry(
      'balletos-nicole-pro-knowledge',
      '1.2.0',
    );
    expect(archived).toBe(NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE[0]);
    expect(NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE[1].registryVersion).toBe('1.3.0');
    expect(Object.isFrozen(NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ARCHIVE)).toBe(true);
    expect(Object.isFrozen(archived?.rules[0].statements[0])).toBe(true);
    expect(resolveNicoleProTrustedKnowledgeRegistry('balletos-nicole-pro-knowledge', '99.0.0')).toBeNull();
  });

  it.each([
    {
      metricId: 'shoulder_horizontal' as const,
      focusId: 'shoulder_line' as const,
      targetId: 'bone.shoulder_line' as const,
      headline: 'Schulterlinie – Nicole prüft',
      anchor: 'shoulder_center' as const,
      label: 'Schulter-Orientierung (2D) · Nicole prüft' as const,
    },
    {
      metricId: 'projected_hip_line_obliquity' as const,
      focusId: 'pelvis_core' as const,
      targetId: 'bone.pelvis_line' as const,
      headline: 'Beckenlinie – Nicole prüft',
      anchor: 'pelvis_center' as const,
      label: 'Becken-Orientierung (2D) · Nicole prüft' as const,
    },
  ])('captures $metricId as a separate immutable Nicole draft', profile => {
    const regionalTarget: SelectedSkeletonTarget = {
      ...target,
      targetId: profile.targetId,
    };
    const regionalEvidence: ReadyGroundedTeacherDraft['evidence'] = {
      ...evidence,
      metricId: profile.metricId,
    };
    const regionalDraft: ReadyGroundedTeacherDraft = {
      ...draft,
      target: profile.focusId,
      evidence: regionalEvidence,
      guide: {
        kind: 'image_horizontal',
        anchor: profile.anchor,
        label: profile.label,
        reviewState: 'pending_nicole',
        evidence: regionalEvidence,
      },
    };
    const context = deterministicContext();
    const content = contentFromGroundedDraft(regionalDraft, regionalTarget, 'Testphase');
    const audit = createGroundedCueReviewAudit({
      draft: regionalDraft,
      target: regionalTarget,
      content,
      context,
    });

    expect(content.headline).toBe(profile.headline);
    expect(content.jointFocusId).toBe(profile.focusId);
    expect(audit.origin.anchor.targetId).toBe(profile.targetId);
    expect(cueReviewAuditIsValid(audit)).toBe(true);
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
