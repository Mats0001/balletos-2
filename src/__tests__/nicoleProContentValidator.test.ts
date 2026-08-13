import { describe, expect, it } from 'vitest';
import {
  createNicoleProValidationAuthority,
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1,
  NICOLE_PRO_VALIDATOR_VERSION,
  validateNicoleProDraft,
} from '../services/nicoleProContentValidator';
import type {
  NicoleProClaimV1,
  NicoleProDraftV1,
  NicoleProEvidencePacketV1,
} from '../types/nicoleProContent';

const evidence: NicoleProEvidencePacketV1 = {
  schemaVersion: 1,
  evidenceId: 'evidence:shoulder:frame-2500',
  analysisArtifactId: 'artifact:plie:1',
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
  side: 'bilateral',
  view: 'frontal',
  videoWidth: 960,
  videoHeight: 1280,
  metricId: 'shoulder_horizontal',
  definitionVersion: 'shoulder-horizontal-image-v1',
  measurementStatus: 'experimental',
  metricInputConfidence: 0.91,
  value: 4.2,
  unit: 'deg',
  uncertainty: { kind: 'not_characterized' },
  captureQuality: 'ready',
  teacherSignal: { state: 'attention', certainty: 'supported' },
  landmarkQuality: {
    status: 'measured',
    score: 0.94,
    modelId: 'mediapipe-pose',
    modelVersion: '0.5',
  },
  temporalRepeatability: { status: 'not_assessed', comparableCycleCount: 1 },
  policyVersion: '0.4.0-phase-evidence-separation',
  evidenceSource: 'exact_frame_cache',
};

const trustedRegistry = NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1;
const knowledge = trustedRegistry.rules[0];

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

function authorityFor(canonicalEvidence: readonly NicoleProEvidencePacketV1[] = [evidence]) {
  const result = createNicoleProValidationAuthority({
    currentContext: context,
    assessment: {
      schemaVersion: 1,
      contextFingerprint: context.fingerprint,
      contextGeneration: context.generation,
      value: {
        analysisArtifactId: evidence.analysisArtifactId,
        sourceId: evidence.sourceId,
        exerciseId: evidence.exerciseId,
        policyVersion: evidence.policyVersion,
        evidence: canonicalEvidence,
      },
    },
  });
  if (!result) throw new Error('Test authority must be valid.');
  return result;
}

const authority = authorityFor();

function claim(
  claimId: string,
  type: NicoleProClaimV1['type'],
  text: string,
  overrides: Partial<NicoleProClaimV1> = {},
): NicoleProClaimV1 {
  const needsEvidence = type !== 'clinical_claim';
  const needsKnowledge = type !== 'clinical_claim';
  const statement = knowledge.statements.find(item => item.claimType === type);
  const projectedText = statement?.textTemplate
    .split('{value}').join('4,2°')
    .split('{phaseLabel}').join(evidence.phaseLabel)
    .split('{side}').join(evidence.side)
    .split('{view}').join(evidence.view) ?? text;
  return {
    schemaVersion: 1,
    claimId,
    type,
    text: projectedText,
    primaryEvidenceId: evidence.evidenceId,
    semanticKey: statement
      ? `${statement.subjectConceptId}:${statement.relation}:${statement.objectConceptId}`
      : `shoulder.${type}`,
    polarity: statement?.polarity ?? 'neutral',
    evidenceIds: needsEvidence ? [evidence.evidenceId] : [],
    knowledgeRuleIds: needsKnowledge ? [knowledge.ruleId] : [],
    conceptIds: statement ? [...new Set([statement.subjectConceptId, statement.objectConceptId])] : [],
    numericEvidenceRefs: [],
    relatedClaimIds: [],
    hypothesisPriority: type === 'teacher_hypothesis' ? 1 : null,
    studentEligibility: ['metric_observation', 'teacher_hypothesis', 'differentiation_test', 'technical_limitation', 'clinical_claim'].includes(type)
      ? 'teacher_only'
      : 'candidate_after_nicole_approval',
    statementId: statement?.statementId ?? 'statement:unsupported',
    ...overrides,
  };
}

function validDraft(): NicoleProDraftV1 {
  const claims = [
    claim('claim:finding', 'visual_observation', 'Die sichtbare Schulterlinie verändert sich am tiefsten Phasenpunkt.'),
    claim('claim:metric', 'metric_observation', 'Die projizierte Schulterlinie weicht im Bild um 4,2° ab.', {
      numericEvidenceRefs: [{
        token: '4,2°', evidenceId: evidence.evidenceId,
        metricId: evidence.metricId, definitionVersion: evidence.definitionVersion,
      }],
    }),
    claim('claim:interpretation', 'biomechanical_interpretation', 'Das kann die sichtbare Organisation von Schultergürtel und Armführung beeinflussen.'),
    claim('claim:hypothesis', 'teacher_hypothesis', 'Eine mögliche Erklärung ist das Timing der Arm- und Schulterorganisation.'),
    claim('claim:test', 'differentiation_test', 'Nicole verändert im nächsten Versuch nur die Armhöhe und vergleicht die Schulterlinie.', { relatedClaimIds: ['claim:hypothesis'] }),
    claim('claim:target', 'teaching_target', 'Die Schulterlinie soll zur gewählten Phase und zum Épaulement klar organisiert bleiben.'),
    claim('claim:cue', 'immediate_cue', 'Schlüsselbeine breit, Ellbogen führt.'),
    claim('claim:practice', 'practice', 'Den Übergang langsam wiederholen und nur eine sichtbare Variable verändern.'),
    claim('claim:success', 'success_criterion', 'Erfolg ist eine wiederholbar ruhigere Schulterlinie bei gleicher Aufgabe.'),
    claim('claim:metaphor', 'metaphor', 'Die Schlüsselbeine tragen ein breites, ruhiges Tablett.'),
    claim('claim:limits', 'technical_limitation', 'Die Bildprojektion bestimmt keine individuelle Ursache.'),
  ];
  return {
    schemaVersion: 1,
    draftId: 'draft:shoulder:1',
    plannerId: 'balletos-nicole-pro-planner',
    plannerVersion: '1.0.0',
    validatorVersion: NICOLE_PRO_VALIDATOR_VERSION,
    policyVersion: evidence.policyVersion,
    generatedAt: '2026-08-13T18:00:00.000Z',
    reviewState: 'pending_nicole',
    learnerVisible: false,
    parentVisible: false,
    evidence: [evidence],
    knowledgeRules: [knowledge],
    claims,
    sections: {
      finding: ['claim:finding', 'claim:metric'],
      interpretation: ['claim:interpretation'],
      hypotheses: ['claim:hypothesis'],
      differentiationTests: ['claim:test'],
      targetAndPractice: ['claim:target', 'claim:cue', 'claim:practice', 'claim:success'],
      metaphor: ['claim:metaphor'],
      measurementDetails: ['claim:metric', 'claim:limits'],
    },
  };
}

function codes(draft: unknown) {
  return validateNicoleProDraft(draft, authority, context).issues.map(item => item.code);
}

describe('Nicole-Pro content contract V1', () => {
  it('accepts a complete internal, evidence-bound teacher draft', () => {
    expect(validateNicoleProDraft(validDraft(), authority, context)).toEqual({ valid: true, issues: [] });
  });

  it('keeps landmark visibility separate from measurement status and uncertainty', () => {
    const draft = validDraft();
    const limited: NicoleProEvidencePacketV1 = {
      ...evidence,
      measurementStatus: 'limited',
      landmarkQuality: { ...evidence.landmarkQuality, score: 0.99 },
      uncertainty: { kind: 'estimated_interval', lower: 2.5, upper: 5.9, unit: 'deg', methodVersion: 'interval-v1' },
    };
    expect(validateNicoleProDraft(
      { ...draft, evidence: [limited] },
      authorityFor([limited]),
      context,
    ).valid).toBe(true);
  });

  it('rejects a solid supported signal when the metric input confidence requires uncertainty', () => {
    const inconsistent: NicoleProEvidencePacketV1 = {
      ...evidence,
      metricInputConfidence: 0.2,
      teacherSignal: { state: 'attention', certainty: 'supported' },
    };
    expect(createNicoleProValidationAuthority({
      currentContext: context,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: {
          analysisArtifactId: evidence.analysisArtifactId,
          sourceId: evidence.sourceId,
          exerciseId: evidence.exerciseId,
          policyVersion: evidence.policyVersion,
          evidence: [inconsistent],
        },
      },
    })).toBeNull();
  });

  it('requires the product-supplied validation authority', () => {
    expect(validateNicoleProDraft(validDraft()).valid).toBe(false);
  });

  it('rejects a structurally identical authority that did not come from the context-bound factory', () => {
    const structuralClone = JSON.parse(JSON.stringify(authority));
    expect(validateNicoleProDraft(validDraft(), structuralClone, context).valid).toBe(false);
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.evidence[0])).toBe(true);
    expect(Object.isFrozen(trustedRegistry.rules[0].statements[0])).toBe(true);
    expect(Object.isFrozen(trustedRegistry.rules[0].statements[0].evidenceConstraint)).toBe(true);
    expect(Object.isFrozen(trustedRegistry.rules[0].statements[0].evidenceConstraint.metrics[0])).toBe(true);
  });

  it('expires an A0 authority after context change even when the user returns to A at generation A2', () => {
    const returnedContext = { ...context, generation: context.generation + 2 };
    expect(validateNicoleProDraft(validDraft(), authority, returnedContext).issues.map(item => item.code))
      .toContain('invalid_evidence');
  });

  it('keeps the authority factory total for malformed runtime input', () => {
    expect(() => createNicoleProValidationAuthority(undefined as never)).not.toThrow();
    expect(createNicoleProValidationAuthority(undefined as never)).toBeNull();
  });

  it('rejects evidence copied from a different assessment epoch even when it is otherwise canonical', () => {
    const foreign = {
      ...evidence,
      analysisArtifactId: 'artifact:plie:foreign',
      analysisContextGeneration: evidence.analysisContextGeneration + 1,
    };
    expect(createNicoleProValidationAuthority({
      currentContext: context,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: {
          analysisArtifactId: foreign.analysisArtifactId,
          sourceId: foreign.sourceId,
          exerciseId: foreign.exerciseId,
          policyVersion: foreign.policyVersion,
          evidence: [foreign],
        },
      },
    })).toBeNull();
  });

  it('rejects planner-modified evidence even when claims and numbers are changed consistently', () => {
    const draft = validDraft();
    const forgedEvidence = { ...evidence, value: 89 };
    const claims = draft.claims.map(item => item.claimId === 'claim:metric'
      ? {
        ...item,
        text: 'Die projizierte Schulterlinie weicht im Bild um 89° ab.',
        numericEvidenceRefs: [{ ...item.numericEvidenceRefs[0], token: '89°' }],
      }
      : item);
    expect(validateNicoleProDraft(
      { ...draft, evidence: [forgedEvidence], claims },
      authority,
      context,
    ).issues.map(item => item.code)).toContain('invalid_evidence');
  });

  it('binds every trusted statement to the allowed metric, definition, phase, side and view', () => {
    const draft = validDraft();
    const pelvisEvidence = {
      ...evidence,
      evidenceId: 'evidence:pelvis:frame-2500',
      metricId: 'projected_hip_line_obliquity',
      definitionVersion: 'pelvis-line-image-v1',
    };
    const claims = draft.claims.map(item => item.claimId === 'claim:finding'
      ? { ...item, primaryEvidenceId: pelvisEvidence.evidenceId, evidenceIds: [pelvisEvidence.evidenceId] }
      : item);
    expect(validateNicoleProDraft(
      { ...draft, evidence: [evidence, pelvisEvidence], claims },
      authorityFor([evidence, pelvisEvidence]),
      context,
    ).issues.map(item => item.code)).toContain('invalid_evidence');
  });

  it.each([
    { phaseConfidence: 0 },
    { value: 0 },
  ])('does not emit a rich finding when statement applicability is not met: %o', patch => {
    const draft = validDraft();
    const inapplicable = { ...evidence, ...patch };
    expect(validateNicoleProDraft(
      { ...draft, evidence: [inapplicable] },
      authorityFor([inapplicable]),
      context,
    ).issues.map(item => item.code)).toContain('invalid_evidence');
  });

  it('binds numeric text to the same primary evidence used to project the statement', () => {
    const draft = validDraft();
    const duplicateMetric = { ...evidence, evidenceId: 'evidence:shoulder:duplicate' };
    const claims = draft.claims.map(item => item.claimId === 'claim:finding'
      ? { ...item, primaryEvidenceId: duplicateMetric.evidenceId, evidenceIds: [duplicateMetric.evidenceId] }
      : item.claimId === 'claim:metric'
        ? { ...item, numericEvidenceRefs: [{ ...item.numericEvidenceRefs[0], evidenceId: duplicateMetric.evidenceId }] }
        : item);
    expect(validateNicoleProDraft(
      { ...draft, evidence: [evidence, duplicateMetric], claims },
      authorityFor([evidence, duplicateMetric]),
      context,
    ).issues.map(item => item.code)).toContain('unsupported_number');
  });

  it('requires a differentiation test to share the exact evidence and trusted statement link of its hypothesis', () => {
    const draft = validDraft();
    const otherFrame = { ...evidence, evidenceId: 'evidence:shoulder:other-frame', mediaTimeUs: evidence.mediaTimeUs + 1 };
    const claims = draft.claims.map(item => item.claimId === 'claim:finding'
      ? { ...item, primaryEvidenceId: otherFrame.evidenceId, evidenceIds: [otherFrame.evidenceId] }
      : item.claimId === 'claim:test'
        ? { ...item, primaryEvidenceId: otherFrame.evidenceId, evidenceIds: [otherFrame.evidenceId] }
        : item);
    expect(validateNicoleProDraft(
      { ...draft, evidence: [evidence, otherFrame], claims },
      authorityFor([evidence, otherFrame]),
      context,
    ).issues.map(item => item.code)).toContain('missing_differentiation_test');
  });

  it('requires every Arabic measurement number to match metricId and definitionVersion', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:metric'
      ? { ...item, text: 'Die Schulterlinie weicht um 89° ab.' }
      : item);
    expect(codes({ ...draft, claims })).toContain('unsupported_number');
  });

  it('rejects a forged numeric reference even when the token is listed', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:metric'
      ? { ...item, text: 'Die Schulterlinie weicht um 89° ab.', numericEvidenceRefs: [{ ...item.numericEvidenceRefs[0], token: '89°' }] }
      : item);
    expect(codes({ ...draft, claims })).toContain('unsupported_number');
  });

  it('does not permit numeric values on qualitative or not-measurable evidence', () => {
    const draft = validDraft();
    expect(codes({
      ...draft,
      evidence: [{ ...evidence, measurementStatus: 'qualitative_only', value: 4.2, unit: 'deg' }],
    })).toContain('invalid_evidence');
  });

  it('does not turn not-measurable evidence into a rich movement assessment', () => {
    const blocked: NicoleProEvidencePacketV1 = {
      ...evidence,
      measurementStatus: 'not_measurable',
      metricInputConfidence: null,
      value: null,
      unit: 'qualitative',
      captureQuality: 'needs_correction',
      landmarkQuality: { ...evidence.landmarkQuality, status: 'unavailable', score: null },
    };
    expect(validateNicoleProDraft(
      { ...validDraft(), evidence: [blocked] },
      authorityFor([blocked]),
      context,
    ).issues.map(item => item.code)).toContain('unsupported_claim_type');
  });

  it('allows biomechanical teacher hypotheses only with a rule and a differentiation test', () => {
    const draft = validDraft();
    const claims = draft.claims.filter(item => item.claimId !== 'claim:test');
    expect(codes({ ...draft, claims, sections: { ...draft.sections, differentiationTests: ['claim:practice'] } }))
      .toEqual(expect.arrayContaining(['missing_differentiation_test', 'invalid_claim']));
  });

  it('rejects concepts and claim types not permitted by their knowledge rule', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis'
      ? { ...item, conceptIds: ['deep_muscle_weakness'] }
      : item);
    expect(codes({ ...draft, claims })).toContain('unsupported_concept');
  });

  it.each([
    'Das ist rein muskulär und vollständig korrigierbar.',
    'Eine Differentialdiagnose zeigt eine Muskelschwäche.',
    'Der M. iliopsoas verursacht hier eine Hyperlordose.',
    'Dieses Muster erhöht das Verletzungsrisiko.',
  ])('blocks diagnosis, prognosis, deep-muscle or absolute language: %s', text => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis' ? { ...item, text } : item);
    expect(codes({ ...draft, claims })).toContain('forbidden_language');
  });

  it('blocks clinical claims even if a caller tries to cite a knowledge rule', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:interpretation'
      ? { ...item, type: 'clinical_claim' as const }
      : item);
    expect(codes({ ...draft, claims })).toContain('unsupported_claim_type');
  });

  it('does not allow a rule awaiting external validation to support output', () => {
    const draft = validDraft();
    const externalRule = { ...knowledge, requiresExternalValidation: true };
    expect(validateNicoleProDraft(
      { ...draft, knowledgeRules: [externalRule] },
      authority,
      context,
    ).issues.map(item => item.code)).toContain('invalid_knowledge_rule');
  });

  it('keeps hypotheses, differentiation tests and metric details teacher-only', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis'
      ? { ...item, studentEligibility: 'candidate_after_nicole_approval' as const }
      : item);
    expect(codes({ ...draft, claims })).toContain('invalid_claim');
  });

  it('rejects contradictory non-hypothesis claims across sections', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:success'
      ? { ...item, semanticKey: 'shoulder.visual_line', polarity: 'opposes' as const }
      : item.claimId === 'claim:finding'
        ? { ...item, semanticKey: 'shoulder.visual_line', polarity: 'supports' as const }
        : item);
    expect(codes({ ...draft, claims })).toContain('contradictory_claims');
  });

  it('keeps every generated Nicole-Pro draft internal', () => {
    const draft = validDraft();
    expect(codes({ ...draft, learnerVisible: true })).toContain('external_visibility_forbidden');
  });

  it('rejects malformed nested data without throwing', () => {
    const malformed = { ...validDraft(), claims: [null], evidence: [{ ...evidence, landmarkQuality: null }] };
    expect(() => validateNicoleProDraft(malformed)).not.toThrow();
    expect(validateNicoleProDraft(malformed, authority, context).valid).toBe(false);
  });

  it('rejects unknown fields instead of carrying hidden clinical payload', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis'
      ? { ...item, clinicalDiagnosis: 'Rotatorenmanschettenläsion' }
      : item);
    expect(codes({ ...draft, claims })).toContain('invalid_claim');
  });

  it('rejects planner-invented rules even if they self-declare external validation', () => {
    const draft = validDraft();
    const forged = {
      ...knowledge,
      ruleId: 'knowledge:forged-muscle',
      status: 'externally_validated' as const,
      conceptIds: ['deep_muscle_weakness'],
      statements: knowledge.statements,
    };
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis'
      ? { ...item, knowledgeRuleIds: [forged.ruleId], conceptIds: ['deep_muscle_weakness'] }
      : item);
    expect(codes({ ...draft, knowledgeRules: [forged], claims })).toContain('invalid_knowledge_rule');
  });

  it.each([
    'Eine Läsion der Rotatorenmanschette ist eindeutig die Ursache.',
    'Der Psoas ist geschwächt.',
    'Das ist immer die Ursache.',
  ])('rejects clinical and absolute bypass wording: %s', text => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis' ? { ...item, text } : item);
    expect(codes({ ...draft, claims })).toContain('forbidden_language');
  });

  it('rejects numeric metric evidence when landmarks are unavailable', () => {
    const draft = validDraft();
    expect(codes({ ...draft, evidence: [{ ...evidence, landmarkQuality: { ...evidence.landmarkQuality, status: 'unavailable', score: null } }] })).toContain('invalid_evidence');
  });

  it('rejects movement measurements from a recording that needs correction', () => {
    const draft = validDraft();
    expect(codes({ ...draft, evidence: [{ ...evidence, captureQuality: 'needs_correction' }] })).toContain('invalid_evidence');
  });

  it('requires explicit symbols for degree and percent numeric claims', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:metric'
      ? { ...item, text: 'Die projizierte Linie weicht um 4,2 ab.', numericEvidenceRefs: [{ ...item.numericEvidenceRefs[0], token: '4,2' }] }
      : item);
    expect(codes({ ...draft, claims })).toContain('unsupported_number');
  });

  it('rejects an estimated interval that does not contain the reported value', () => {
    const draft = validDraft();
    const invalidInterval: NicoleProEvidencePacketV1 = {
      ...evidence,
      measurementStatus: 'limited',
      uncertainty: { kind: 'estimated_interval', lower: 5, upper: 7, unit: 'deg', methodVersion: 'interval-v1' },
    };
    expect(createNicoleProValidationAuthority({
      currentContext: context,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: { analysisArtifactId: evidence.analysisArtifactId, sourceId: evidence.sourceId, exerciseId: evidence.exerciseId, policyVersion: evidence.policyVersion, evidence: [invalidInterval] },
      },
    })).toBeNull();
  });

  it('requires at least two cycles before evidence may claim stable repeatability', () => {
    const draft = validDraft();
    const falseRepeatability: NicoleProEvidencePacketV1 = {
      ...evidence,
      temporalRepeatability: { status: 'stable', comparableCycleCount: 1 },
    };
    expect(createNicoleProValidationAuthority({
      currentContext: context,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: { analysisArtifactId: evidence.analysisArtifactId, sourceId: evidence.sourceId, exerciseId: evidence.exerciseId, policyVersion: evidence.policyVersion, evidence: [falseRepeatability] },
      },
    })).toBeNull();
  });

  it('rejects unassessed repeatability that nevertheless claims many comparable cycles', () => {
    const inconsistent = { ...evidence, temporalRepeatability: { status: 'not_assessed' as const, comparableCycleCount: 999 } };
    expect(createNicoleProValidationAuthority({
      currentContext: context,
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: { analysisArtifactId: evidence.analysisArtifactId, sourceId: evidence.sourceId, exerciseId: evidence.exerciseId, policyVersion: evidence.policyVersion, evidence: [inconsistent] },
      },
    })).toBeNull();
  });

  it('does not allow non-test claims to carry arbitrary claim links', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:practice'
      ? { ...item, relatedClaimIds: ['claim:does-not-exist'] }
      : item);
    expect(codes({ ...draft, claims })).toContain('invalid_claim');
  });

  it('requires contiguous hypothesis priorities', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:hypothesis'
      ? { ...item, hypothesisPriority: 2 as const }
      : item);
    expect(codes({ ...draft, claims })).toContain('incomplete_content');
  });

  it('requires canonical UTC timestamps', () => {
    expect(codes({ ...validDraft(), generatedAt: '2026-08-13 18:00:00' })).toContain('invalid_shape');
  });

  it('rejects evidence, rules and claims that are smuggled in but unused', () => {
    const draft = validDraft();
    const unusedEvidence = { ...evidence, evidenceId: 'evidence:unused' };
    const unusedRule = { ...knowledge, ruleId: 'knowledge:unused' };
    const unusedClaim = { ...draft.claims[0], claimId: 'claim:unused' };
    const result = validateNicoleProDraft(
      {
        ...draft,
        evidence: [...draft.evidence, unusedEvidence],
        knowledgeRules: [...draft.knowledgeRules, unusedRule],
        claims: [...draft.claims, unusedClaim],
      },
      authorityFor([...authority.evidence, unusedEvidence]),
      context,
    );
    expect(result.issues.map(item => item.code)).toEqual(expect.arrayContaining(['unknown_reference', 'incomplete_content']));
  });

  it('binds claim polarity to the trusted statement instead of caller input', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:finding'
      ? { ...item, polarity: 'supports' as const }
      : item);
    expect(codes({ ...draft, claims })).toContain('invalid_claim');
  });

  it('rejects exercise IDs outside the canonical motion registry', () => {
    const invalidExercise = { ...evidence, exerciseId: 'unknown-motion' } as unknown as NicoleProEvidencePacketV1;
    expect(createNicoleProValidationAuthority({
      currentContext: { ...context, context: { ...context.context, exerciseId: 'unknown-motion' as never } },
      assessment: {
        schemaVersion: 1,
        contextFingerprint: context.fingerprint,
        contextGeneration: context.generation,
        value: {
          analysisArtifactId: invalidExercise.analysisArtifactId,
          sourceId: invalidExercise.sourceId,
          exerciseId: invalidExercise.exerciseId,
          policyVersion: invalidExercise.policyVersion,
          evidence: [invalidExercise],
        },
      },
    })).toBeNull();
  });

  it('normalizes semantic keys for contradiction detection', () => {
    const draft = validDraft();
    const claims = draft.claims.map(item => item.claimId === 'claim:success'
      ? { ...item, semanticKey: ' SHOULDER.VISUAL_LINE ', polarity: 'opposes' as const }
      : item.claimId === 'claim:finding'
        ? { ...item, semanticKey: 'shoulder.visual_line', polarity: 'supports' as const }
        : item);
    expect(codes({ ...draft, claims })).toContain('contradictory_claims');
  });

  it('requires all rich Nicole-Pro sections instead of disclaimer-only output', () => {
    const draft = validDraft();
    expect(codes({ ...draft, sections: { ...draft.sections, differentiationTests: [] } })).toContain('incomplete_content');
  });

  it('requires target, immediate cue, practice and success criterion individually', () => {
    const draft = validDraft();
    const removedIds = new Set(['claim:cue', 'claim:practice', 'claim:success']);
    expect(codes({
      ...draft,
      claims: draft.claims.filter(item => !removedIds.has(item.claimId)),
      sections: { ...draft.sections, targetAndPractice: ['claim:target'] },
    })).toContain('incomplete_content');
  });

  it('rejects semantically duplicate hypotheses used to fill multiple priority slots', () => {
    const draft = validDraft();
    const hypothesis = draft.claims.find(item => item.claimId === 'claim:hypothesis')!;
    const duplicate = { ...hypothesis, claimId: 'claim:hypothesis:duplicate', hypothesisPriority: 2 as const };
    const test = draft.claims.find(item => item.claimId === 'claim:test')!;
    const secondTest = { ...test, claimId: 'claim:test:duplicate', relatedClaimIds: [duplicate.claimId] };
    expect(codes({
      ...draft,
      claims: [...draft.claims, duplicate, secondTest],
      sections: {
        ...draft.sections,
        hypotheses: [...draft.sections.hypotheses, duplicate.claimId],
        differentiationTests: [...draft.sections.differentiationTests, secondTest.claimId],
      },
    })).toContain('contradictory_claims');
  });
});
