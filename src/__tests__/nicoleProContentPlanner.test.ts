import { describe, expect, it } from 'vitest';
import {
  bindAssessmentIfCurrent,
  createAnalysisContextEpoch,
  type AnalysisContextEpochV1,
  type AnalysisContextV1,
} from '../services/analysisContextGuard';
import {
  createNicoleProValidationAuthority,
  validateNicoleProDraft,
} from '../services/nicoleProContentValidator';
import {
  createNicoleProDraftId,
  createNicoleProExactFrameArtifactId,
  currentNicoleProDraftForGrounded,
  groundedDraftMatchesCurrentSelection,
  NICOLE_PRO_LANDMARK_MODEL_V1,
  nicoleProDraftMatchesGroundedSelection,
  planNicoleProDraft,
  planNicoleProGroundedDraft,
} from '../services/nicoleProContentPlanner';
import { projectGroundedTeacherEvidence } from '../services/nicoleProGroundedEvidence';
import { teacherHeuristicEngine } from '../services/teacherHeuristicEngine';
import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { NicoleProDraftV1 } from '../types/nicoleProContent';
import type { GroundedMetricAdapterId, SkeletonTargetFocusId } from '../types/skeletonTarget';
import type { TeacherHeuristicState } from '../types/teacherHeuristic';
import type { VaganovaFullAnalysis, VaganovaMeasurement } from '../services/vaganovaAngleCalculator';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';

const SOURCE_ID = '/videos/nicole_saal_1.mp4';
const POLICY_VERSION = '0.4.0-phase-evidence-separation';

const METRICS: Readonly<Record<GroundedMetricAdapterId, Readonly<{
  target: Extract<SkeletonTargetFocusId, 'shoulder_line' | 'spine_center' | 'pelvis_core'>;
  guide: Pick<ReadyGroundedTeacherDraft['guide'], 'kind' | 'anchor' | 'label'>;
  keyword: string;
  metaphorKeyword: string;
}>>> = Object.freeze({
  shoulder_horizontal: {
    target: 'shoulder_line',
    guide: { kind: 'image_horizontal', anchor: 'shoulder_center', label: 'Schulter-Orientierung (2D) · Nicole prüft' },
    keyword: 'Schulterlinie',
    metaphorKeyword: 'Tablett',
  },
  spine_tilt_aplomb: {
    target: 'spine_center',
    guide: { kind: 'image_vertical', anchor: 'pelvis_center', label: 'Aplomb-Orientierung (2D) · Nicole prüft' },
    keyword: 'Rumpfachse',
    metaphorKeyword: 'goldener Faden',
  },
  projected_hip_line_obliquity: {
    target: 'pelvis_core',
    guide: { kind: 'image_horizontal', anchor: 'pelvis_center', label: 'Becken-Orientierung (2D) · Nicole prüft' },
    keyword: 'Beckenlinie',
    metaphorKeyword: 'Schale',
  },
});

function context(generation = 4) {
  const value: AnalysisContextV1 = {
    schemaVersion: 1,
    sourceId: SOURCE_ID,
    studentId: 'student:emma-berger',
    exerciseId: 'plie',
    levelId: 'minis',
  };
  return createAnalysisContextEpoch(value, generation);
}

function groundedDraft(
  metricId: GroundedMetricAdapterId,
  valueDeg: number,
  heuristicState: Exclude<TeacherHeuristicState, 'blocked'>,
  mediaTimeUs = 2_500_000,
): ReadyGroundedTeacherDraft {
  const profile = METRICS[metricId];
  const evidence = Object.freeze({
    metricId,
    valueDeg,
    confidence: heuristicState.includes('_uncertain') ? 0.2 : 0.94,
    landmarkVisibility: 0.94,
    measurementClass: 'vaganova_relation' as const,
    heuristicState,
    sourceId: SOURCE_ID,
    streamEpoch: 2,
    generation: 7,
    mediaTimeUs,
    videoWidth: 960,
    videoHeight: 1280,
    policyVersion: POLICY_VERSION,
    source: 'exact_frame_cache' as const,
  });
  return Object.freeze({
    kind: 'ready',
    target: profile.target,
    reviewState: 'pending_nicole',
    learnerVisible: false,
    parentVisible: false,
    evidence,
    sections: Object.freeze({
      what: 'Grounded observation', whyConditional: 'Grounded interpretation', goalConditional: 'Grounded goal',
      practiceForTeacherReview: 'Grounded practice', metaphor: 'Grounded metaphor', technical: 'Grounded technical',
      limitations: 'Grounded limitation', sourceRefs: Object.freeze(['exact frame cache']),
    }),
    guide: Object.freeze({ ...profile.guide, reviewState: 'pending_nicole', evidence }),
  });
}

function boundGroundedDraft(draft: ReadyGroundedTeacherDraft, currentContext: AnalysisContextEpochV1) {
  const assessment = bindAssessmentIfCurrent(currentContext, currentContext, draft);
  if (!assessment) throw new Error('Golden grounded draft must bind to its creation context.');
  return assessment;
}

function buildFixture(
  metricId: GroundedMetricAdapterId,
  valueDeg: number,
  heuristicState: Exclude<TeacherHeuristicState, 'blocked'>,
  suffix: string,
) {
  const currentContext = context();
  const grounded = groundedDraft(metricId, valueDeg, heuristicState);
  const groundedAssessment = boundGroundedDraft(grounded, currentContext);
  const evidence = projectGroundedTeacherEvidence({
    groundedAssessment,
    analysisArtifactId: `artifact:plie:${suffix}`,
    context: currentContext,
    view: 'frontal',
    landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
    captureQuality: 'ready',
  });
  if (!evidence) throw new Error('Golden fixture must project evidence.');
  const authority = createNicoleProValidationAuthority({
    currentContext,
    assessment: {
      schemaVersion: 1,
      contextFingerprint: currentContext.fingerprint,
      contextGeneration: currentContext.generation,
      value: {
        analysisArtifactId: evidence.analysisArtifactId,
        sourceId: evidence.sourceId,
        exerciseId: evidence.exerciseId,
        policyVersion: evidence.policyVersion,
        evidence: [evidence],
      },
    },
  });
  if (!authority) throw new Error('Golden fixture must mint a current authority.');
  const draft = planNicoleProDraft({
    draftId: `draft:${suffix}`,
    generatedAt: '2026-08-13T20:00:00.000Z',
    evidenceId: evidence.evidenceId,
    authority,
    currentContext,
  });
  if (!draft) throw new Error('Golden fixture must plan a valid draft.');
  return { currentContext, grounded, groundedAssessment, evidence, authority, draft };
}

function contentQualityScore(
  draft: NicoleProDraftV1,
  expectedKeyword: string,
  metaphorKeyword: string,
  authority: ReturnType<typeof createNicoleProValidationAuthority>,
  currentContext: AnalysisContextEpochV1,
): number {
  const claims = draft.claims;
  const byType = (type: string) => claims.filter(claim => claim.type === type);
  const checks = [
    byType('visual_observation').some(claim => claim.text.includes(expectedKeyword)),
    Boolean(authority && validateNicoleProDraft(draft, authority, currentContext).valid),
    byType('biomechanical_interpretation').every(claim => /falls|kann/i.test(claim.text)),
    ['teaching_target', 'immediate_cue', 'practice', 'success_criterion'].every(type => byType(type).length === 1),
    byType('metaphor').some(claim => claim.text.includes(metaphorKeyword) && claim.text.length > 35),
    claims.every(claim => !/diagnos|verletzungsrisiko|rein muskul|vollständig korrigier|m\.\s?(?:iliopsoas|multifidus)/i.test(claim.text)),
    claims.every(claim => claim.text.trim().endsWith('.') || claim.text.trim().endsWith('!')),
    draft.evidence.every(item => item.frameAuthority === 'exact_cache_frame' && item.phaseId === 'paused_exact_frame'),
    byType('metaphor').every(claim => !/[A-ZÄÖÜ]{5,}/.test(claim.text)),
    draft.reviewState === 'pending_nicole' && !draft.learnerVisible && !draft.parentVisible
      && claims.every(claim => claim.claimId && claim.statementId),
  ];
  return checks.filter(Boolean).length;
}

const GOLDEN_CASES = [
  ['shoulder_horizontal', 6.2, 'heuristic_attention', 'shoulder-supported'],
  ['shoulder_horizontal', 13.3, 'heuristic_strong_attention_uncertain', 'shoulder-uncertain'],
  ['spine_tilt_aplomb', 5.5, 'heuristic_attention', 'spine-supported'],
  ['spine_tilt_aplomb', 11.8, 'heuristic_strong_attention_uncertain', 'spine-uncertain'],
  ['projected_hip_line_obliquity', 6.4, 'heuristic_attention_uncertain', 'pelvis-uncertain'],
  ['projected_hip_line_obliquity', 13.6, 'heuristic_strong_attention', 'pelvis-supported'],
] as const;

function policyMeasurement(value: number, confidence: number): VaganovaMeasurement {
  return { value, confidence, unit: 'deg', label: 'policy fixture', measurement_class: 'vaganova_relation' };
}

function policyAnalysis(metricId: GroundedMetricAdapterId, value: number, confidence: number): VaganovaFullAnalysis {
  const baseline = policyMeasurement(1, 0.94);
  return {
    knieFlexionL: null, knieFlexionR: null, valgusDriftL: null, valgusDriftR: null,
    turnoutL: null, turnoutR: null, spineTilt: metricId === 'spine_tilt_aplomb' ? policyMeasurement(value, confidence) : baseline,
    epaulement: null, portDeBrasL: null, portDeBrasR: null,
    pelvicTilt: metricId === 'projected_hip_line_obliquity' ? policyMeasurement(value, confidence) : baseline,
    shoulderSymmetry: metricId === 'shoulder_horizontal' ? policyMeasurement(value, confidence) : baseline,
    shoulderElevationL: null, shoulderElevationR: null, armLineQualityL: null, armLineQualityR: null,
    headTilt: null, plumbDeviation: null,
  };
}

function policySkeleton(): ReconstructedSkeleton {
  const p = (x: number, y: number) => ({ x, y, vis: 0.95 });
  return {
    head: p(500, 120), neck: p(500, 260), sternum: p(500, 360), navel: p(500, 470), pelvisCenter: p(500, 550),
    shoulderL: p(400, 300), shoulderR: p(600, 300), elbowL: p(300, 350), elbowR: p(700, 350),
    wristL: p(200, 300), wristR: p(800, 300), pelvisL: p(450, 550), pelvisR: p(550, 550),
    kneeL: p(380, 700), kneeR: p(620, 700), ankleL: p(350, 850), ankleR: p(650, 850),
    footL: p(380, 850), footR: p(620, 850),
  };
}

const GOLDEN_ACTION_COPY: Readonly<Record<GroundedMetricAdapterId, Readonly<Record<
  'teaching_target' | 'immediate_cue' | 'practice' | 'success_criterion' | 'metaphor', string
>>>> = Object.freeze({
  shoulder_horizontal: {
    teaching_target: 'Ziel ist eine zur Phase passende, ruhig getragene Schulterlinie, die das Épaulement unterstützt statt zufällig zu kippen.',
    immediate_cue: 'Schlüsselbeine breit – der Ellbogen führt, die Schulter folgt ruhig.',
    practice: 'Die Passage langsam bis zum markierten Frame wiederholen, nur eine Hypothese verändern und die Schulterlinie im direkten Vorher-nachher-Vergleich prüfen.',
    success_criterion: 'Erfolg ist sichtbar, wenn die Schulterlinie bei gleicher Phase und Ansicht wiederholbar ruhiger wird, ohne die beabsichtigte Armform zu verlieren.',
    metaphor: 'Die Schlüsselbeine tragen ein breites Tablett: offen und ruhig, während die Arme frei darum herum tanzen.',
  },
  spine_tilt_aplomb: {
    teaching_target: 'Ziel ist eine zur Phase passende Rumpfachse, bei der Schultermitte und Beckenmitte kontrolliert miteinander organisiert bleiben.',
    immediate_cue: 'Scheitel lang, Brustbein über der Beckenmitte – getragen, nicht starr.',
    practice: 'Die Passage in kleinerem Bewegungsumfang wiederholen, am markierten Moment kurz halten und Rumpfachse sowie Gewichtsverlagerung gemeinsam vergleichen.',
    success_criterion: 'Erfolg ist sichtbar, wenn die Rumpfachse bei gleicher Phase und Ansicht wiederholbar näher an Nicoles gewünschter Linie bleibt.',
    metaphor: 'Ein goldener Faden führt durch die Körperblöcke: lang gestapelt wie ruhige Bausteine, ohne festzufrieren.',
  },
  projected_hip_line_obliquity: {
    teaching_target: 'Ziel ist eine zur Aufgabe passende Beckenorganisation, die stützende Basis, beide Beine und Rumpf klar miteinander verbindet.',
    immediate_cue: 'Trag die Beckenschale ruhig über der stützenden Basis – beweglich, aber nicht auslaufend.',
    practice: 'Die Passage langsam und kleiner wiederholen, sichtbare Fußorganisation und Beckenlinie am markierten Frame gemeinsam prüfen und nur eine Variable verändern.',
    success_criterion: 'Erfolg ist sichtbar, wenn die Beckenlinie bei gleicher Phase und Ansicht wiederholbar ruhiger wird und der Bewegungsweg kontrolliert bleibt.',
    metaphor: 'Das Becken ist eine gefüllte Schale: Du trägst sie ruhig durch die Bewegung, ohne sie starr festzuhalten.',
  },
});

describe('Nicole-Pro deterministic grounded vertical slice', () => {
  it('derives draft identity from context, artifact and content contract versions', () => {
    const a0 = context(4);
    const a2 = context(6);
    const b1 = createAnalysisContextEpoch({ ...a0.context, exerciseId: 'passe' }, 5);
    const identity = (current: AnalysisContextEpochV1) => createNicoleProDraftId(
      current,
      2_500_000,
      NICOLE_PRO_LANDMARK_MODEL_V1,
      'spine_tilt_aplomb',
      POLICY_VERSION,
    );
    expect(identity(a0)).toBe(identity(context(4)));
    expect(identity(a0)).not.toBe(identity(b1));
    expect(identity(a0)).not.toBe(identity(a2));
    expect(identity(a0)).toContain('registry@balletos-nicole-pro-knowledge@1.3.0');
    expect(identity(a0)).toContain('planner@balletos-nicole-pro-deterministic-planner@1.0.0');
    expect(identity(a0)).toContain('validator@nicole-pro-validator-v1');
  });
  it.each(GOLDEN_CASES)('uses a teacher signal produced by the current policy for %s at %s°', (metricId, value, state) => {
    const confidence = state.includes('_uncertain') ? 0.2 : 0.94;
    const packet = teacherHeuristicEngine.compute(
      policyAnalysis(metricId, value, confidence), policySkeleton(), 2.5, 2,
    );
    const actual = metricId === 'shoulder_horizontal'
      ? packet.shoulder
      : metricId === 'spine_tilt_aplomb'
        ? packet.spine
        : packet.pelvis;
    expect(actual).toBe(state);
  });

  it.each(GOLDEN_CASES)('creates a complete 10/10 golden assessment for %s at %s°', (metricId, value, state, suffix) => {
    const fixture = buildFixture(metricId, value, state, suffix);
    const profile = METRICS[metricId];
    expect(contentQualityScore(
      fixture.draft, profile.keyword, profile.metaphorKeyword, fixture.authority, fixture.currentContext,
    )).toBe(10);
    const expectedHypothesisCount = metricId === 'shoulder_horizontal' ? 3 : 4;
    expect(fixture.draft.claims.filter(claim => claim.type === 'teacher_hypothesis')).toHaveLength(expectedHypothesisCount);
    expect(fixture.draft.claims.filter(claim => claim.type === 'differentiation_test')).toHaveLength(expectedHypothesisCount);
    expect(fixture.draft.claims.find(claim => claim.type === 'metric_observation')?.text)
      .toContain(value.toFixed(1).replace('.', ',') + '°');
    for (const [type, expectedText] of Object.entries(GOLDEN_ACTION_COPY[metricId])) {
      expect(fixture.draft.claims.find(claim => claim.type === type)?.text).toBe(expectedText);
    }
    if (metricId === 'spine_tilt_aplomb') {
      const muscleHypothesis = fixture.draft.claims.find(claim => claim.type === 'teacher_hypothesis'
        && claim.text.includes('Iliopsoas'));
      const muscleTest = fixture.draft.claims.find(claim => claim.type === 'differentiation_test'
        && muscleHypothesis && claim.relatedClaimIds.includes(muscleHypothesis.claimId));
      expect(muscleHypothesis?.text).toContain('nicht bestimmt');
      expect(muscleHypothesis?.text).not.toMatch(/diagnos|schwach|verkürzt|verursacht|alleinige ursache/iu);
      expect(muscleTest?.text).toContain('ohne daraus einen einzelnen Muskelbefund abzuleiten');
      expect(fixture.draft.knowledgeRules[0].sourceRefs).toContainEqual(expect.stringContaining('NBK560799'));
    }
    if (metricId === 'projected_hip_line_obliquity') {
      const muscleHypothesis = fixture.draft.claims.find(claim => claim.type === 'teacher_hypothesis'
        && claim.text.includes('Piriformis'));
      const muscleTest = fixture.draft.claims.find(claim => claim.type === 'differentiation_test'
        && muscleHypothesis && claim.relatedClaimIds.includes(muscleHypothesis.claimId));
      expect(muscleHypothesis?.text).toContain('weder Kraft, Länge noch Ursache');
      expect(muscleHypothesis?.text).not.toMatch(/diagnos|schwach|verkürzt|verursacht|alleinige ursache/iu);
      expect(muscleTest?.text).toContain('ohne daraus einen isolierten Piriformis-Befund abzuleiten');
      expect(fixture.draft.knowledgeRules[0].sourceRefs).toContainEqual(expect.stringContaining('NBK519497'));
    }
  });

  it('is deterministic and deep-frozen for identical evidence and injected time', () => {
    const first = buildFixture('spine_tilt_aplomb', 5.5, 'heuristic_attention', 'deterministic');
    const second = planNicoleProDraft({
      draftId: first.draft.draftId,
      generatedAt: first.draft.generatedAt,
      evidenceId: first.evidence.evidenceId,
      authority: first.authority,
      currentContext: first.currentContext,
    });
    expect(second).toEqual(first.draft);
    expect(Object.isFrozen(first.draft)).toBe(true);
    expect(Object.isFrozen(first.draft.claims[0])).toBe(true);
  });

  it('runs the complete Grounded-to-Pro composition and rejects a stale epoch', () => {
    const fixture = buildFixture('spine_tilt_aplomb', 5.5, 'heuristic_attention', 'composed');
    const input = {
      groundedAssessment: fixture.groundedAssessment,
      currentContext: fixture.currentContext,
      analysisArtifactId: fixture.evidence.analysisArtifactId,
      view: 'frontal' as const,
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
      captureQuality: 'ready' as const,
      draftId: fixture.draft.draftId,
      generatedAt: fixture.draft.generatedAt,
    };
    expect(planNicoleProGroundedDraft(input)).toEqual(fixture.draft);
    expect(planNicoleProGroundedDraft({
      ...input,
      currentContext: context(fixture.currentContext.generation + 1),
    })).toBeNull();
    expect(planNicoleProGroundedDraft(undefined as never)).toBeNull();
  });

  it('allows the 2D spine-axis rule in a profile view but keeps shoulder and pelvis frontal-only', () => {
    const spine = buildFixture('spine_tilt_aplomb', 5.5, 'heuristic_attention', 'profile-spine');
    const common = {
      currentContext: spine.currentContext,
      analysisArtifactId: createNicoleProExactFrameArtifactId(
        spine.currentContext, spine.grounded.evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
      ),
      view: 'profile_left' as const,
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
      captureQuality: 'ready' as const,
      generatedAt: '2026-08-13T20:00:00.000Z',
    };
    expect(planNicoleProGroundedDraft({
      ...common,
      groundedAssessment: spine.groundedAssessment,
      draftId: 'draft:profile-spine',
    })).not.toBeNull();
    expect(planNicoleProGroundedDraft({
      ...common,
      view: 'profile_right',
      groundedAssessment: spine.groundedAssessment,
      draftId: 'draft:profile-spine-right',
    })).not.toBeNull();

    const shoulder = buildFixture('shoulder_horizontal', 6.2, 'heuristic_attention', 'profile-shoulder');
    expect(planNicoleProGroundedDraft({
      ...common,
      groundedAssessment: shoulder.groundedAssessment,
      analysisArtifactId: createNicoleProExactFrameArtifactId(
        shoulder.currentContext, shoulder.grounded.evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
      ),
      draftId: 'draft:profile-shoulder',
    })).toBeNull();

    const pelvis = buildFixture(
      'projected_hip_line_obliquity', 6.4, 'heuristic_attention', 'profile-pelvis',
    );
    expect(planNicoleProGroundedDraft({
      ...common,
      groundedAssessment: pelvis.groundedAssessment,
      analysisArtifactId: createNicoleProExactFrameArtifactId(
        pelvis.currentContext, pelvis.grounded.evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
      ),
      draftId: 'draft:profile-pelvis',
    })).toBeNull();
  });

  it('uses one exact capability contract for context, gate, selection and Grounded/Pro evidence', () => {
    const fixture = buildFixture('spine_tilt_aplomb', 5.5, 'heuristic_attention', 'capability');
    const analysisArtifactId = createNicoleProExactFrameArtifactId(
      fixture.currentContext, fixture.grounded.evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
    );
    const pro = planNicoleProGroundedDraft({
      groundedAssessment: fixture.groundedAssessment,
      currentContext: fixture.currentContext,
      analysisArtifactId,
      view: 'frontal',
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
      captureQuality: 'ready',
      draftId: 'draft:capability',
      generatedAt: '2026-08-13T20:00:00.000Z',
    });
    expect(pro).not.toBeNull();
    const proAssessment = pro
      ? bindAssessmentIfCurrent(fixture.currentContext, fixture.currentContext, pro)
      : null;
    const selectedTarget = {
      targetId: 'bone.torso_side_r' as const,
      kind: 'bone' as const,
      anchorNormalized: { x: 0.5, y: 0.5 },
      sourceId: fixture.grounded.evidence.sourceId,
      streamEpoch: fixture.grounded.evidence.streamEpoch,
      generation: fixture.grounded.evidence.generation,
      mediaTimeUs: fixture.grounded.evidence.mediaTimeUs,
      frameStatus: 'exact_cache_frame' as const,
    };
    const capability = {
      groundedAssessment: fixture.groundedAssessment,
      proAssessment,
      currentContext: fixture.currentContext,
      selectedTarget,
      captureQuality: 'ready' as const,
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
    };
    expect(currentNicoleProDraftForGrounded(capability)).toEqual(pro);
    expect(currentNicoleProDraftForGrounded({ ...capability, captureQuality: null })).toBeNull();
    expect(currentNicoleProDraftForGrounded({
      ...capability,
      currentContext: context(fixture.currentContext.generation + 1),
    })).toBeNull();
    expect(currentNicoleProDraftForGrounded({
      ...capability,
      selectedTarget: { ...selectedTarget, generation: selectedTarget.generation + 1 },
    })).toBeNull();
    expect(currentNicoleProDraftForGrounded({
      ...capability,
      selectedTarget: { ...selectedTarget, targetId: 'bone.shoulder_line' },
    })).toBeNull();
    const tampered = pro ? structuredClone(pro) : null;
    if (tampered) tampered.evidence[0].value = 99;
    expect(nicoleProDraftMatchesGroundedSelection({
      grounded: fixture.grounded,
      pro: tampered,
      currentContext: fixture.currentContext,
      selectedTarget,
      captureQuality: 'ready',
      landmarkModel: NICOLE_PRO_LANDMARK_MODEL_V1,
    })).toBe(false);
    expect(currentNicoleProDraftForGrounded({
      ...capability,
      landmarkModel: { modelId: 'second-pose-model', modelVersion: '2.0.0' },
    })).toBeNull();

    const secondModel = { modelId: 'second-pose-model', modelVersion: '2.0.0' } as const;
    const foreignPro = planNicoleProGroundedDraft({
      groundedAssessment: fixture.groundedAssessment,
      currentContext: fixture.currentContext,
      analysisArtifactId: createNicoleProExactFrameArtifactId(
        fixture.currentContext, fixture.grounded.evidence.mediaTimeUs, secondModel,
      ),
      view: 'frontal',
      landmarkModel: secondModel,
      captureQuality: 'ready',
      draftId: 'draft:capability:second-model',
      generatedAt: '2026-08-13T20:00:00.000Z',
    });
    expect(foreignPro).not.toBeNull();
    expect(currentNicoleProDraftForGrounded({
      ...capability,
      proAssessment: foreignPro
        ? bindAssessmentIfCurrent(fixture.currentContext, fixture.currentContext, foreignPro)
        : null,
    })).toBeNull();
    expect(currentNicoleProDraftForGrounded(undefined as never)).toBeNull();
    expect(groundedDraftMatchesCurrentSelection(undefined as never)).toBe(false);
  });

  it('uses definition-bound one-decimal display precision for experimental measurements', () => {
    const fixture = buildFixture(
      'shoulder_horizontal', 13.37649281, 'heuristic_strong_attention', 'precision',
    );
    const metric = fixture.draft.claims.find(claim => claim.type === 'metric_observation');
    expect(metric?.text).toContain('13,4°');
    expect(metric?.text).not.toContain('13,37649281');
    expect(metric?.numericEvidenceRefs).toEqual([expect.objectContaining({ token: '13,4°' })]);
  });

  it('keeps the generic plie pelvis plan bilateral and free of unmeasured pressure claims', () => {
    const fixture = buildFixture(
      'projected_hip_line_obliquity', 6.4, 'heuristic_attention', 'bilateral-pelvis',
    );
    const text = fixture.draft.claims.map(claim => claim.text).join(' ');
    expect(text).not.toMatch(/Standbein|Arbeitsbein|Standfußdruck|Gewicht auf der Fußaußenkante/i);
    expect(text).toContain('beide Beine');
    expect(text).toContain('sichtbare Fußorganisation');
  });

  it('preserves dotted-evidence semantics without changing the teacher signal colour class', () => {
    const fixture = buildFixture('shoulder_horizontal', 6.2, 'heuristic_attention_weak_evidence', 'dotted');
    expect(fixture.evidence.teacherSignal).toEqual({ state: 'attention', certainty: 'weak_evidence' });
  });

  it('keeps measurement confidence, teacher certainty and landmark visibility as separate facts', () => {
    const fixture = buildFixture(
      'shoulder_horizontal', 13.3, 'heuristic_strong_attention_uncertain', 'separate-quality-facts',
    );
    expect(fixture.grounded.evidence.confidence).toBe(0.2);
    expect(fixture.evidence.metricInputConfidence).toBe(0.2);
    expect(fixture.evidence.teacherSignal).toEqual({ state: 'strong_attention', certainty: 'uncertain' });
    expect(fixture.evidence.landmarkQuality).toMatchObject({ status: 'measured', score: 0.94 });
  });

  it('rejects a supported solid signal when metric confidence is below the teacher-policy floor', () => {
    const currentContext = context();
    const invalid = groundedDraft('shoulder_horizontal', 6.2, 'heuristic_attention');
    const lowConfidence = {
      ...invalid,
      evidence: { ...invalid.evidence, confidence: 0.2 },
      guide: { ...invalid.guide, evidence: { ...invalid.guide.evidence, confidence: 0.2 } },
    } as ReadyGroundedTeacherDraft;
    expect(projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(lowConfidence, currentContext),
      analysisArtifactId: 'artifact:unsupported-solid', context: currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready',
    })).toBeNull();
  });

  it('does not promote a legacy review overlay into grounded Nicole-Pro evidence', () => {
    const currentContext = context();
    const draft = groundedDraft('shoulder_horizontal', 5.2, 'heuristic_review');
    const evidence = projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(draft, currentContext), analysisArtifactId: 'artifact:review', context: currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'usable_with_caution',
    });
    expect(evidence).toBeNull();
  });

  it('does not plan corrective content for a match signal', () => {
    const currentContext = context();
    const grounded = groundedDraft('shoulder_horizontal', 0.2, 'heuristic_match');
    const evidence = projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(grounded, currentContext), analysisArtifactId: 'artifact:match', context: currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready',
    });
    expect(evidence?.teacherSignal.state).toBe('match');
    if (!evidence) throw new Error('Match evidence should remain available as evidence.');
    const authority = createNicoleProValidationAuthority({
      currentContext,
      assessment: { schemaVersion: 1, contextFingerprint: currentContext.fingerprint, contextGeneration: currentContext.generation, value: {
        analysisArtifactId: evidence.analysisArtifactId, sourceId: evidence.sourceId, exerciseId: evidence.exerciseId,
        policyVersion: evidence.policyVersion, evidence: [evidence],
      } },
    });
    expect(authority && planNicoleProDraft({
      draftId: 'draft:match', generatedAt: '2026-08-13T20:00:00.000Z',
      evidenceId: evidence.evidenceId, authority, currentContext,
    })).toBeNull();
  });

  it('fails closed on stale context and mismatched grounded target identity', () => {
    const fixture = buildFixture('projected_hip_line_obliquity', 4.4, 'heuristic_attention', 'stale');
    expect(planNicoleProDraft({
      draftId: 'draft:stale', generatedAt: '2026-08-13T20:00:00.000Z',
      evidenceId: fixture.evidence.evidenceId, authority: fixture.authority,
      currentContext: context(fixture.currentContext.generation + 1),
    })).toBeNull();
    expect(projectGroundedTeacherEvidence({
      groundedAssessment: fixture.groundedAssessment,
      analysisArtifactId: 'artifact:stale-reprojection',
      context: context(fixture.currentContext.generation + 2),
      view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' },
      captureQuality: 'ready',
    })).toBeNull();
    expect(projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(
        { ...fixture.grounded, target: 'shoulder_line' },
        fixture.currentContext,
      ),
      analysisArtifactId: 'artifact:mismatch', context: fixture.currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready',
    })).toBeNull();
  });

  it('fails closed when guide provenance differs from the grounded evidence', () => {
    const currentContext = context();
    const draft = groundedDraft('spine_tilt_aplomb', 4.1, 'heuristic_attention');
    const mismatched = {
      ...draft,
      guide: {
        ...draft.guide,
        evidence: { ...draft.guide.evidence, generation: draft.guide.evidence.generation + 1 },
      },
    } as ReadyGroundedTeacherDraft;
    expect(projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(mismatched, currentContext), analysisArtifactId: 'artifact:guide-mismatch', context: currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready',
    })).toBeNull();

    const wrongGuideShape = {
      ...draft,
      guide: {
        ...draft.guide,
        kind: 'image_horizontal',
        anchor: 'shoulder_center',
        label: 'Schulter-Orientierung (2D) · Nicole prüft',
      },
    } as unknown as ReadyGroundedTeacherDraft;
    expect(projectGroundedTeacherEvidence({
      groundedAssessment: boundGroundedDraft(wrongGuideShape, currentContext),
      analysisArtifactId: 'artifact:guide-shape-mismatch', context: currentContext, view: 'frontal',
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready',
    })).toBeNull();
  });

  it('fails closed for unsupported runtime heuristic and non-cache evidence payloads', () => {
    const currentContext = context();
    const draft = groundedDraft('projected_hip_line_obliquity', 3.6, 'heuristic_attention');
    const invalidHeuristic = {
      ...draft,
      evidence: { ...draft.evidence, heuristicState: 'unexpected_green' },
      guide: { ...draft.guide, evidence: { ...draft.guide.evidence, heuristicState: 'unexpected_green' } },
    } as unknown as ReadyGroundedTeacherDraft;
    const nonCache = {
      ...draft,
      evidence: { ...draft.evidence, source: 'live_frame' },
      guide: { ...draft.guide, evidence: { ...draft.guide.evidence, source: 'live_frame' } },
    } as unknown as ReadyGroundedTeacherDraft;
    const shared = {
      analysisArtifactId: 'artifact:invalid-runtime', context: currentContext, view: 'frontal' as const,
      landmarkModel: { modelId: 'mediapipe-pose', modelVersion: '0.5' }, captureQuality: 'ready' as const,
    };
    expect(projectGroundedTeacherEvidence({ groundedAssessment: boundGroundedDraft(invalidHeuristic, currentContext), ...shared })).toBeNull();
    expect(projectGroundedTeacherEvidence({ groundedAssessment: boundGroundedDraft(nonCache, currentContext), ...shared })).toBeNull();
  });

  it('is total at malformed public runtime boundaries', () => {
    expect(projectGroundedTeacherEvidence(undefined as never)).toBeNull();
    expect(projectGroundedTeacherEvidence({ groundedAssessment: null } as never)).toBeNull();
    expect(planNicoleProDraft(undefined as never)).toBeNull();
    expect(planNicoleProDraft({ authority: null } as never)).toBeNull();
  });
});
