import { describe, expect, it } from 'vitest';
import {
  createNicoleProValidationAuthority,
} from '../services/nicoleProContentValidator';
import { planNicoleProDraft } from '../services/nicoleProContentPlanner';
import {
  anatomyAnnotationTargetClaimType,
  createNicoleAnatomyValidationAuthority,
  NICOLE_PRO_ANATOMY_REGISTRY_ARCHIVE,
  NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1,
  resolveNicoleProAnatomyRegistry,
  validateNicoleAnatomyProBundle,
} from '../services/nicoleProAnatomyValidator';
import {
  createNicoleAnatomyBundleId,
  nicoleAnatomyBundleMatchesNicoleProDraft,
  planNicoleAnatomyForNicoleProDraft,
  planNicoleAnatomyProBundle,
} from '../services/nicoleProAnatomyPlanner';
import type { NicoleProClaimV1, NicoleProEvidencePacketV1 } from '../types/nicoleProContent';
import type {
  NicoleAnatomyDifferentiationAnnotationV1,
  NicoleAnatomyHypothesisAnnotationV1,
  NicoleAnatomyProBundleV1,
} from '../types/nicoleProAnatomy';

const evidence: NicoleProEvidencePacketV1 = {
  schemaVersion: 1,
  evidenceId: 'evidence:spine:frame-2500',
  analysisArtifactId: 'artifact:plie:anatomy-v1',
  analysisContextFingerprint: '[1,"/clip.mp4","student:emma","plie","minis"]',
  analysisContextGeneration: 3,
  sourceId: '/clip.mp4',
  exerciseId: 'plie',
  phaseId: 'paused_exact_frame',
  phaseLabel: 'Pausierter Analyseframe',
  phaseConfidence: 1,
  cycleIndex: 0,
  mediaTimeUs: 2_500_000,
  frameAuthority: 'exact_cache_frame',
  side: 'center',
  view: 'frontal',
  videoWidth: 960,
  videoHeight: 1280,
  metricId: 'spine_tilt_aplomb',
  definitionVersion: 'spine-center-image-vertical-v1',
  measurementStatus: 'experimental',
  metricInputConfidence: 0.91,
  value: 6.2,
  unit: 'deg',
  uncertainty: { kind: 'not_characterized' },
  captureQuality: 'ready',
  teacherSignal: { state: 'attention', certainty: 'supported' },
  landmarkQuality: { status: 'measured', score: 0.94, modelId: 'mediapipe-pose', modelVersion: '0.5' },
  temporalRepeatability: { status: 'not_assessed', comparableCycleCount: 1 },
  policyVersion: '0.4.0-phase-evidence-separation',
  evidenceSource: 'exact_frame_cache',
};

const context = {
  schemaVersion: 1 as const,
  context: {
    schemaVersion: 1 as const,
    sourceId: evidence.sourceId,
    studentId: 'student:emma',
    exerciseId: evidence.exerciseId,
    levelId: 'minis' as const,
  },
  fingerprint: evidence.analysisContextFingerprint,
  generation: evidence.analysisContextGeneration,
};

function fixture(packet: NicoleProEvidencePacketV1 = evidence) {
  const currentContext = {
    ...context,
    context: { ...context.context, sourceId: packet.sourceId, exerciseId: packet.exerciseId },
    fingerprint: packet.analysisContextFingerprint,
    generation: packet.analysisContextGeneration,
  };
  const nicoleProAuthority = createNicoleProValidationAuthority({
    currentContext,
    assessment: {
      schemaVersion: 1,
      contextFingerprint: currentContext.fingerprint,
      contextGeneration: currentContext.generation,
      value: {
        analysisArtifactId: packet.analysisArtifactId,
        sourceId: packet.sourceId,
        exerciseId: packet.exerciseId,
        policyVersion: packet.policyVersion,
        evidence: [packet],
      },
    },
  });
  if (!nicoleProAuthority) throw new Error('Fixture must mint the parent authority.');
  const draft = planNicoleProDraft({
    draftId: 'draft:anatomy-contract',
    generatedAt: '2026-08-14T08:00:00.000Z',
    evidenceId: packet.evidenceId,
    authority: nicoleProAuthority,
    currentContext,
  });
  if (!draft) throw new Error('Fixture must plan the parent Nicole-Pro draft.');
  const authority = createNicoleAnatomyValidationAuthority({
    draft,
    nicoleProAuthority,
    currentContext,
    phaseId: packet.phaseId,
    side: packet.side,
    view: packet.view,
  });
  if (!authority) throw new Error('Fixture must mint the Anatomy Pro authority.');
  const visual = draft.claims.find(claim => claim.type === 'visual_observation');
  const metric = draft.claims.find(claim => claim.type === 'metric_observation');
  if (!visual || !metric) throw new Error('Fixture requires visual and metric claims.');
  const hypotheses = draft.claims.filter(claim => claim.type === 'teacher_hypothesis');
  const tests = draft.claims.filter(claim => claim.type === 'differentiation_test');
  if (hypotheses.length < 3 || tests.length < 3) throw new Error('Fixture requires multiple paired hypotheses and tests.');
  return { authority, currentContext, draft, visual, metric, hypotheses, tests };
}

function hypothesis(
  statementId: string,
  epistemicKind: NicoleAnatomyHypothesisAnnotationV1['epistemicKind'],
  hypothesisRole: NicoleAnatomyHypothesisAnnotationV1['hypothesisRole'],
  hypothesisDomain: NicoleAnatomyHypothesisAnnotationV1['hypothesisDomain'],
  sourceClaim: NicoleProClaimV1,
  testId: string,
  visualClaimId: string,
  metricClaimId: string,
): NicoleAnatomyHypothesisAnnotationV1 {
  return {
    statementId,
    reviewState: 'ai_draft',
    scientificValidation: 'curated_internal',
    internalOnly: true,
    outwardEligibility: false,
    kind: 'hypothesis_annotation',
    epistemicKind,
    hypothesisDomain,
    hypothesisRole,
    modality: 'possible',
    sourceClaimId: sourceClaim.claimId,
    claimBindingIds: ['binding:visual', 'binding:metric'],
    knowledgeItemIds: [NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.items[0].itemId],
    explainsClaimIds: [visualClaimId, metricClaimId],
    linkedDifferentiationTestIds: [testId],
  };
}

function testStep(
  statementId: string,
  targetHypothesisId: string,
  sourceClaim: NicoleProClaimV1,
): NicoleAnatomyDifferentiationAnnotationV1 {
  return {
    statementId,
    reviewState: 'ai_draft',
    scientificValidation: 'curated_internal',
    internalOnly: true,
    outwardEligibility: false,
    kind: 'differentiation_annotation',
    epistemicKind: 'differentiation_step',
    sourceClaimId: sourceClaim.claimId,
    targetHypothesisIds: [targetHypothesisId],
    allowedPerformer: 'nicole',
    safetyClass: 'observation_only',
    contraindicationCodes: [],
    outcomeCriteria: {
      supports: 'visible_pattern_changes_with_isolated_variable',
      weakens: 'visible_pattern_unchanged_with_isolated_variable',
      inconclusive: 'comparison_not_equivalent',
    },
    humanRecordedResult: null,
  };
}

function validBundle(): NicoleAnatomyProBundleV1 {
  const { visual, metric, hypotheses, tests } = fixture();
  const workingSource = hypotheses.find(item => item.conceptIds.includes('torso_weight_transfer_timing'));
  const alternativeSource = hypotheses.find(item => item.conceptIds.includes('intentional_torso_inclination'));
  const artifactSource = hypotheses.find(item => item.conceptIds.includes('torso_camera_projection'));
  if (!workingSource || !alternativeSource || !artifactSource) throw new Error('Fixture requires classified torso hypotheses.');
  const workingTestSource = tests.find(item => item.relatedClaimIds.includes(workingSource.claimId));
  const alternativeTestSource = tests.find(item => item.relatedClaimIds.includes(alternativeSource.claimId));
  const artifactTestSource = tests.find(item => item.relatedClaimIds.includes(artifactSource.claimId));
  if (!workingTestSource || !alternativeTestSource || !artifactTestSource) throw new Error('Fixture hypothesis/test pairs must be canonical.');
  const working = hypothesis(
    'hypothesis:working:coordination', 'working_hypothesis', 'working', 'coordination',
    workingSource,
    'test:working:coordination', visual.claimId, metric.claimId,
  );
  const artifact = hypothesis(
    'hypothesis:counter:camera', 'counter_hypothesis', 'artifact', 'capture_artifact',
    artifactSource,
    'test:counter:camera', visual.claimId, metric.claimId,
  );
  const alternative = hypothesis(
    'hypothesis:counter:intentional', 'counter_hypothesis', 'alternative', 'technical',
    alternativeSource,
    'test:counter:intentional', visual.claimId, metric.claimId,
  );
  return {
    schemaVersion: 1,
    bundleId: 'anatomy-bundle:plie:frame-2500',
    contentVersion: 1,
    createdAt: '2026-08-14T08:05:00.000Z',
    supersedesBundleId: null,
    origin: 'ai_suggestion',
    context: {
      analysisArtifactId: evidence.analysisArtifactId,
      analysisContextFingerprint: evidence.analysisContextFingerprint,
      analysisContextGeneration: evidence.analysisContextGeneration,
      sourceId: evidence.sourceId,
      exerciseId: evidence.exerciseId,
      phaseId: evidence.phaseId,
      side: evidence.side,
      view: evidence.view,
      policyVersion: evidence.policyVersion,
    },
    knowledgeRegistryId: NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.registryId,
    knowledgeRegistryVersion: NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.registryVersion,
    internalOnly: true,
    outwardEligibility: false,
    claimBindings: [
      {
        bindingId: 'binding:visual', claimId: visual.claimId, evidenceIds: [...visual.evidenceIds],
        epistemicKind: 'visible_observation', reviewState: 'ai_draft', internalOnly: true, outwardEligibility: false,
      },
      {
        bindingId: 'binding:metric', claimId: metric.claimId, evidenceIds: [...metric.evidenceIds],
        epistemicKind: 'measurement', reviewState: 'ai_draft', internalOnly: true, outwardEligibility: false,
      },
    ],
    knowledgeItems: [NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.items[0]],
    claimAnnotations: [
      working,
      alternative,
      artifact,
      testStep('test:working:coordination', working.statementId, workingTestSource),
      testStep('test:counter:intentional', alternative.statementId, alternativeTestSource),
      testStep('test:counter:camera', artifact.statementId, artifactTestSource),
    ],
    humanSignals: [],
    safetyActions: [],
    expertNotes: [],
  };
}

function validate(value: unknown, current = context) {
  return validateNicoleAnatomyProBundle(value, fixture().authority, current);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('Nicole Anatomy Pro contract V1', () => {
  it('accepts a current internal draft with explicit epistemic and review axes', () => {
    expect(validate(validBundle())).toEqual({ valid: true, issues: [] });
  });

  it('is total and rejects malformed or extra payload fields', () => {
    expect(() => validate(undefined)).not.toThrow();
    expect(validate(undefined).valid).toBe(false);
    expect(validate({ ...validBundle(), clinicalDiagnosis: 'forged' }).valid).toBe(false);
    expect(validate({ ...validBundle(), claimAnnotations: [null] }).valid).toBe(false);
  });

  it('requires an authority minted from the current Nicole-Pro draft', () => {
    expect(validateNicoleAnatomyProBundle(validBundle(), undefined, context).valid).toBe(false);
    const forged = clone(fixture().authority);
    expect(validateNicoleAnatomyProBundle(validBundle(), forged, context).valid).toBe(false);
  });

  it('rejects stale A0 authority after A to B to A2 context changes', () => {
    const returnedToA = { ...context, generation: context.generation + 2 };
    expect(validate(validBundle(), returnedToA).valid).toBe(false);
  });

  it('does not let Nicole review upgrade scientific validation', () => {
    const bundle = clone(validBundle());
    bundle.knowledgeItems = [{
      ...bundle.knowledgeItems[0],
      reviewState: 'nicole_accepted',
      scientificValidation: 'externally_validated_for_stated_scope',
    }];
    expect(validate(bundle).issues.map(item => item.code)).toContain('unknown_reference');
  });

  it('rejects canonical registry knowledge outside its current view applicability', () => {
    const bundle = clone(validBundle());
    const profileOnly = NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.items.find(item => (
      item.itemId === 'anatomy:boundary:profile-view-does-not-establish-cause'
    ));
    if (!profileOnly) throw new Error('Fixture requires the profile-scoped registry item.');
    bundle.knowledgeItems = [profileOnly];
    bundle.claimAnnotations = bundle.claimAnnotations.map(item => item.kind === 'hypothesis_annotation'
      ? { ...item, knowledgeItemIds: [profileOnly.itemId] }
      : item);
    expect(validate(bundle).issues.map(item => item.code)).toContain('unknown_reference');
  });

  it('does not let an AI payload claim Nicole review', () => {
    const bundle = clone(validBundle());
    bundle.claimAnnotations = bundle.claimAnnotations.map((item, index) => (
      index === 0 ? { ...item, reviewState: 'nicole_accepted' } : item
    ));
    expect(validate(bundle).issues.map(item => item.code)).toContain('invalid_review_state');
  });

  it('rejects shadow claim text and other unregistered narrative fields', () => {
    const bundle = validBundle();
    const payload = {
      ...bundle,
      claimAnnotations: bundle.claimAnnotations.map((item, index) => index === 0
        ? { ...item, text: 'Der Piriformis verursacht dieses Muster immer.' }
        : item),
    };
    expect(validate(payload).issues.map(item => item.code)).toContain('invalid_shape');
  });

  it('rejects an annotation that points at an unrelated current claim', () => {
    const bundle = clone(validBundle());
    const unrelated = fixture().draft.claims.find(item => item.type === 'metaphor');
    if (!unrelated) throw new Error('Fixture requires a metaphor claim.');
    bundle.claimAnnotations = bundle.claimAnnotations.map((item, index) => (
      index === 0 && item.kind === 'hypothesis_annotation'
        ? { ...item, sourceClaimId: unrelated.claimId }
        : item
    ));
    expect(validate(bundle).issues.map(item => item.code)).toContain('unknown_reference');
  });

  it('binds explained claims and evidence exactly to the current observation bindings', () => {
    const metaphor = fixture().draft.claims.find(item => item.type === 'metaphor');
    if (!metaphor) throw new Error('Fixture requires a metaphor claim.');
    const wrongClaim = clone(validBundle());
    wrongClaim.claimAnnotations = wrongClaim.claimAnnotations.map((item, index) => (
      index === 0 && item.kind === 'hypothesis_annotation'
        ? { ...item, explainsClaimIds: [metaphor.claimId] }
        : item
    ));
    expect(validate(wrongClaim).issues.map(item => item.code)).toContain('unknown_reference');

    const wrongEvidence = clone(validBundle());
    wrongEvidence.claimBindings = wrongEvidence.claimBindings.map((item, index) => (
      index === 0 ? { ...item, evidenceIds: ['evidence:other-frame'] } : item
    ));
    expect(validate(wrongEvidence).issues.map(item => item.code)).toContain('unknown_reference');
  });

  it('derives hypothesis kind, role and domain from product-owned source metadata', () => {
    const bundle = clone(validBundle());
    bundle.claimAnnotations = bundle.claimAnnotations.map((item, index) => (
      index === 0 && item.kind === 'hypothesis_annotation'
        ? {
          ...item,
          epistemicKind: 'counter_hypothesis' as const,
          hypothesisRole: 'artifact' as const,
          hypothesisDomain: 'capture_artifact' as const,
        }
        : item
    ));
    expect(validate(bundle).issues.map(item => item.code)).toContain('invalid_epistemic_kind');
  });

  it('rejects unknown hypothesis and differentiation enum values at runtime', () => {
    const base = validBundle();
    const badDomain = {
      ...base,
      claimAnnotations: base.claimAnnotations.map((item, index) => index === 0
        ? { ...item, hypothesisDomain: 'banana' }
        : item),
    };
    expect(validate(badDomain).issues.map(item => item.code)).toContain('invalid_shape');

    const badTest = {
      ...base,
      claimAnnotations: base.claimAnnotations.map(item => item.kind === 'differentiation_annotation'
        ? { ...item, allowedPerformer: 'student', safetyClass: 'banana' }
        : item),
    };
    expect(validate(badTest).issues.map(item => item.code)).toContain('invalid_shape');
  });

  it('keeps the product registry deeply immutable', () => {
    const item = NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.items[0];
    expect(Object.isFrozen(NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1)).toBe(true);
    expect(Object.isFrozen(NICOLE_PRO_ANATOMY_TRUSTED_REGISTRY_V1.items)).toBe(true);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.sourceRefs[0])).toBe(true);
    expect(Object.isFrozen(item.applicability.exerciseIds)).toBe(true);
    expect(resolveNicoleProAnatomyRegistry('balletos-nicole-anatomy-pro', '1.0.0'))
      .toBe(NICOLE_PRO_ANATOMY_REGISTRY_ARCHIVE[0]);
    expect(resolveNicoleProAnatomyRegistry('balletos-nicole-anatomy-pro', '1.1.0'))
      .toBe(NICOLE_PRO_ANATOMY_REGISTRY_ARCHIVE[1]);
  });

  it('requires a counterhypothesis including a capture-artifact alternative', () => {
    const noCounter = clone(validBundle());
    noCounter.claimAnnotations = noCounter.claimAnnotations.filter(item => (
      item.kind !== 'hypothesis_annotation' || item.epistemicKind !== 'counter_hypothesis'
    )).filter(item => item.statementId !== 'test:counter:camera');
    expect(validate(noCounter).issues.map(item => item.code)).toContain('missing_counter_hypothesis');

    const nonArtifact = clone(validBundle());
    const counterIndex = nonArtifact.claimAnnotations.findIndex(item => item.statementId === 'hypothesis:counter:camera');
    nonArtifact.claimAnnotations = nonArtifact.claimAnnotations.map((item, index) => (
      index === counterIndex && item.kind === 'hypothesis_annotation'
        ? { ...item, hypothesisDomain: 'technical' }
        : item
    ));
    expect(validate(nonArtifact).issues.map(item => item.code)).toContain('missing_counter_hypothesis');
  });

  it('requires reciprocal safe differentiation tests with an inconclusive outcome', () => {
    const bundle = clone(validBundle());
    const testIndex = bundle.claimAnnotations.findIndex(item => item.statementId === 'test:working:coordination');
    bundle.claimAnnotations = bundle.claimAnnotations.map((item, index) => (
      index === testIndex && item.kind === 'differentiation_annotation'
        ? { ...item, safetyClass: 'clinical_only', allowedPerformer: 'health_professional' }
        : item
    ));
    const codes = validate(bundle).issues.map(item => item.code);
    expect(codes).toContain('invalid_test');
  });

  it('rejects AI-fabricated human test results, human signals and referral actions', () => {
    const resultBundle = clone(validBundle());
    const testIndex = resultBundle.claimAnnotations.findIndex(item => item.kind === 'differentiation_annotation');
    resultBundle.claimAnnotations = resultBundle.claimAnnotations.map((item, index) => (
      index === testIndex && item.kind === 'differentiation_annotation'
        ? {
          ...item,
          humanRecordedResult: {
            result: 'supports' as const, recordedBy: 'AI', recordedAt: '2026-08-14T08:06:00.000Z', note: null,
          },
        }
        : item
    ));
    expect(validate(resultBundle).issues.map(item => item.code)).toContain('invalid_test');

    const signalBundle = clone(validBundle());
    signalBundle.humanSignals = [{
      signalId: 'signal:pain', signalCode: 'pain', sourceRole: 'student', acquisitionMode: 'reported',
      recordedBy: 'AI', recordedAt: '2026-08-14T08:07:00.000Z',
      assessmentContextFingerprint: evidence.analysisContextFingerprint, context: 'inferred from video', verbatim: null,
    }];
    signalBundle.safetyActions = [{
      statementId: 'safety:referral', reviewState: 'ai_draft', scientificValidation: 'curated_internal',
      internalOnly: true, outwardEligibility: false, kind: 'safety_action', epistemicKind: 'safety_notice',
      policyRuleId: 'forged', policyRuleVersion: '1', humanSignalIds: ['signal:pain'],
      action: 'seek_urgent_professional_input', urgency: 'urgent', text: 'Das ist eine Diagnose.',
    }];
    const codes = validate(signalBundle).issues.map(item => item.code);
    expect(codes).toContain('invalid_human_signal');
    expect(codes).toContain('invalid_safety_action');
  });

  it('accepts a rich Piriformis/Iliopsoas note only as an unverified non-computational reviewer draft', () => {
    const base = validBundle();
    const noteOnly: NicoleAnatomyProBundleV1 = {
      ...base,
      bundleId: 'anatomy-note:1',
      origin: 'reviewer_note_draft',
      claimBindings: [],
      knowledgeItems: [],
      claimAnnotations: [],
      humanSignals: [],
      safetyActions: [],
      expertNotes: [{
        noteId: 'note:nicole:1', authorId: 'nicole', createdAt: '2026-08-14T08:10:00.000Z', revision: 1,
        text: 'Nicole prüft intern mögliche Zusammenhänge von Piriformis, Iliopsoas, Beckenorganisation und Bewegungsstrategie.',
        nonComputational: true, internalOnly: true, outwardEligibility: false,
      }],
    };
    expect(validate(noteOnly)).toEqual({ valid: true, issues: [] });
  });

  it('rejects an expert note when it is smuggled into a computational reference', () => {
    const bundle = clone(validBundle());
    const first = bundle.claimAnnotations[0] as NicoleAnatomyHypothesisAnnotationV1;
    bundle.claimAnnotations = bundle.claimAnnotations.map((item, index) => (
      index === 0 ? { ...first, knowledgeItemIds: ['note:nicole:1'] } : item
    ));
    expect(validate(bundle).issues.map(item => item.code)).toContain('invalid_scientific_status');
  });

  it('keeps Anatomy Pro on the existing Nicole-Pro claim hierarchy', () => {
    const bundle = validBundle();
    expect(bundle.claimAnnotations.map(anatomyAnnotationTargetClaimType)).toEqual([
      'teacher_hypothesis', 'teacher_hypothesis', 'teacher_hypothesis',
      'differentiation_test', 'differentiation_test', 'differentiation_test',
    ]);
  });

  it('plans a deterministic internal Iliopsoas knowledge chain over existing torso claims', () => {
    const built = fixture();
    const bundle = planNicoleAnatomyProBundle({
      bundleId: 'anatomy:planned:spine',
      createdAt: '2026-08-14T09:00:00.000Z',
      authority: built.authority,
      currentContext: built.currentContext,
    });
    expect(bundle).not.toBeNull();
    expect(bundle?.internalOnly).toBe(true);
    expect(bundle?.outwardEligibility).toBe(false);
    expect(bundle?.humanSignals).toEqual([]);
    expect(bundle?.safetyActions).toEqual([]);
    expect(bundle?.claimAnnotations.filter(item => item.kind === 'hypothesis_annotation')).toHaveLength(4);
    expect(bundle?.claimAnnotations.filter(item => item.kind === 'differentiation_annotation')).toHaveLength(4);
    const muscleClaim = built.draft.claims.find(claim => claim.type === 'teacher_hypothesis'
      && claim.text.includes('Iliopsoas'));
    const muscleAnnotation = bundle?.claimAnnotations.find(item => item.kind === 'hypothesis_annotation'
      && item.sourceClaimId === muscleClaim?.claimId);
    expect(muscleAnnotation).toMatchObject({
      epistemicKind: 'counter_hypothesis',
      hypothesisDomain: 'anatomical',
      hypothesisRole: 'alternative',
      scientificValidation: 'curated_internal',
    });
    expect(muscleAnnotation && 'knowledgeItemIds' in muscleAnnotation
      ? muscleAnnotation.knowledgeItemIds : []).toContain('anatomy:function:iliopsoas-lumbopelvic-v1');
    expect(bundle?.knowledgeItems.find(item => item.itemId === 'anatomy:function:iliopsoas-lumbopelvic-v1'))
      .toMatchObject({ scientificValidation: 'source_supported', outwardEligibility: false });
    expect(bundle?.claimAnnotations.some(item => 'text' in item || 'prompt' in item)).toBe(false);
    expect(validateNicoleAnatomyProBundle(bundle, built.authority, built.currentContext).valid).toBe(true);
  });

  it('plans and revalidates the current runtime Anatomy bundle from the parent Pro draft', () => {
    const built = fixture();
    const bundle = planNicoleAnatomyForNicoleProDraft({
      draft: built.draft,
      currentContext: built.currentContext,
    });

    expect(bundle?.bundleId).toBe(createNicoleAnatomyBundleId(built.draft));
    expect(nicoleAnatomyBundleMatchesNicoleProDraft({
      bundle,
      draft: built.draft,
      currentContext: built.currentContext,
    })).toBe(true);
    expect(nicoleAnatomyBundleMatchesNicoleProDraft({
      bundle,
      draft: built.draft,
      currentContext: { ...built.currentContext, generation: built.currentContext.generation + 1 },
    })).toBe(false);
  });

  it('plans the position-dependent Piriformis chain without strength, length or cause claims', () => {
    const pelvisEvidence: NicoleProEvidencePacketV1 = {
      ...evidence,
      evidenceId: 'evidence:pelvis:frame-2500',
      side: 'bilateral',
      metricId: 'projected_hip_line_obliquity',
      definitionVersion: 'pelvis-line-image-v1',
      value: 6.4,
    };
    const built = fixture(pelvisEvidence);
    const bundle = planNicoleAnatomyProBundle({
      bundleId: 'anatomy:planned:pelvis',
      createdAt: '2026-08-14T09:01:00.000Z',
      authority: built.authority,
      currentContext: built.currentContext,
    });
    const piriformisKnowledge = bundle?.knowledgeItems.find(item => (
      item.itemId === 'anatomy:function:piriformis-position-dependent-v1'
    ));
    expect(piriformisKnowledge?.statement).toContain('hüftpositionsabhängig');
    expect(piriformisKnowledge?.statement).toContain('weder ein individueller Kraft-/Längenbefund noch eine Ursache');
    expect(piriformisKnowledge?.sourceRefs[0].sourceId).toBe('ncbi-bookshelf:NBK519497');
    expect(piriformisKnowledge?.statement).not.toMatch(/diagnos|schwach|verkürzt|verursacht/iu);
    expect(bundle && validateNicoleAnatomyProBundle(bundle, built.authority, built.currentContext).valid).toBe(true);
  });

  it('refuses to plan with a stale A0 Anatomy authority after A to B to A2', () => {
    const built = fixture();
    expect(planNicoleAnatomyProBundle({
      bundleId: 'anatomy:planned:stale',
      createdAt: '2026-08-14T09:02:00.000Z',
      authority: built.authority,
      currentContext: { ...built.currentContext, generation: built.currentContext.generation + 2 },
    })).toBeNull();
  });
});
