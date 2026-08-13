import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { NicoleProClaimV1, NicoleProDraftV1 } from '../types/nicoleProContent';
import type { SelectedSkeletonTarget } from '../types/skeletonTarget';
import {
  createNicoleProValidationAuthority,
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1,
  NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
  resolveNicoleProTrustedKnowledgeRegistry,
  validateStoredNicoleProDraft,
  validateNicoleProDraft,
} from './nicoleProContentValidator';
import type { AnalysisContextEpochV1 } from './analysisContextGuard';
import {
  createNicoleProExactFrameArtifactId,
  NICOLE_PRO_LANDMARK_MODEL_V1,
} from './nicoleProArtifactIdentity';
import type {
  CueAudienceProjection,
  CueAiOriginSnapshot,
  CueAudience,
  CueReviewAudit,
  CueReviewAuditEvent,
  CueReviewCommandContext,
  CueReviewContent,
  CueReviewEditablePatch,
  CueReviewExpectedState,
  CueReviewProjection,
  CueTeacherRevision,
  NicoleProAiOriginPayload,
} from '../types/cueReviewAudit';

const DIGEST_ALGORITHM = 'sha256-canonical-json-v1' as const;

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

/** Small dependency-free SHA-256 implementation for deterministic browser storage digests. */
export function sha256Canonical(value: unknown): string {
  const input = new TextEncoder().encode(canonicalJson(value));
  const constants = new Uint32Array(64);
  const hash = new Uint32Array(8);
  let primeCount = 0;
  for (let candidate = 2; primeCount < 64; candidate += 1) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) {
      if (candidate % divisor === 0) { prime = false; break; }
    }
    if (!prime) continue;
    if (primeCount < 8) hash[primeCount] = Math.floor((Math.sqrt(candidate) % 1) * 0x100000000);
    constants[primeCount] = Math.floor((Math.cbrt(candidate) % 1) * 0x100000000);
    primeCount += 1;
  }

  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const words = new Uint32Array(64);
  const rotate = (value32: number, bits: number) => (value32 >>> bits) | (value32 << (32 - bits));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash].map(word => word.toString(16).padStart(8, '0')).join('');
}

function cloneFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const clone = Array.isArray(value)
    ? value.map(item => cloneFreeze(item))
    : Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cloneFreeze(item)]));
  return Object.freeze(clone) as T;
}

export function freezeCueReviewAudit(audit: CueReviewAudit): CueReviewAudit {
  return cloneFreeze(audit);
}

export function defaultCueReviewContext(actorId: string = 'nicole'): CueReviewCommandContext {
  const uuid = () => globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {
    actorId,
    now: () => new Date().toISOString(),
    createId: prefix => `${prefix}-${uuid()}`,
  };
}

function originWithDigest(origin: Omit<CueAiOriginSnapshot, 'originDigest' | 'digestAlgorithm'>): CueAiOriginSnapshot {
  const digestInput = cloneFreeze(origin);
  return cloneFreeze({ ...origin, digestAlgorithm: DIGEST_ALGORITHM, originDigest: sha256Canonical(digestInput) });
}

function revisionWithDigest(
  content: CueReviewContent,
  revisionNumber: number,
  contentVersion: number,
  parentRevisionId: string | null,
  context: CueReviewCommandContext,
): CueTeacherRevision {
  const core = cloneFreeze({
    revisionId: context.createId('revision'),
    parentRevisionId,
    revisionNumber,
    contentVersion,
    contentSchemaVersion: 1 as const,
    actorId: context.actorId,
    createdAt: context.now(),
    content: cloneFreeze(content),
    digestAlgorithm: DIGEST_ALGORITHM,
    contentDigest: sha256Canonical(content),
  });
  return cloneFreeze({ ...core, revisionDigest: sha256Canonical(core) });
}

function event(
  type: CueReviewAuditEvent['type'],
  audit: Pick<CueReviewAudit, 'origin'>,
  revisionId: string,
  revisionDigest: string,
  context: CueReviewCommandContext,
  extra: Pick<CueReviewAuditEvent, 'audience' | 'reason'> = {},
  previousEvents: readonly CueReviewAuditEvent[] = [],
): CueReviewAuditEvent {
  const previousEventDigest = previousEvents.length > 0
    ? previousEvents[previousEvents.length - 1].eventDigest
    : null;
  const eventCore = cloneFreeze({
    eventId: context.createId('event'), type, actorId: context.actorId, at: context.now(),
    eventSequence: previousEvents.length + 1,
    revisionId, revisionDigest, originId: audit.origin.originId, ...extra, previousEventDigest,
  });
  return cloneFreeze({
    ...eventCore,
    digestAlgorithm: DIGEST_ALGORITHM,
    eventDigest: sha256Canonical(eventCore),
  });
}

export function contentFromGroundedDraft(
  draft: ReadyGroundedTeacherDraft,
  _target: SelectedSkeletonTarget,
  poseName: string,
): CueReviewContent {
  const headline = draft.evidence.metricId === 'shoulder_horizontal'
    ? 'Schulterlinie – Nicole prüft'
    : draft.evidence.metricId === 'projected_hip_line_obliquity'
      ? 'Beckenlinie – Nicole prüft'
      : 'Rumpfachse – Nicole prüft';
  return cloneFreeze({
    poseName,
    status: 'NEUTRAL',
    headline,
    cueMetaphor: draft.sections.metaphor,
    jointFocusId: draft.target,
    diagnosisText: `${draft.sections.what}\n\n${draft.sections.whyConditional}`,
    goalText: draft.sections.goalConditional,
    practiceText: draft.sections.practiceForTeacherReview,
    technicalAnalysis: `${draft.sections.technical}\n\n${draft.sections.limitations}\n\nQuellen: ${draft.sections.sourceRefs.join(' · ')}`,
    referenceImageKey: undefined,
    nicoleAction: undefined,
  });
}

function claimsForSection(
  draft: NicoleProDraftV1,
  section: keyof NicoleProDraftV1['sections'],
): readonly NicoleProClaimV1[] {
  const byId = new Map(draft.claims.map(claim => [claim.claimId, claim]));
  return draft.sections[section]
    .map(claimId => byId.get(claimId))
    .filter((claim): claim is NicoleProClaimV1 => Boolean(claim));
}

function joinedClaimText(
  draft: NicoleProDraftV1,
  section: keyof NicoleProDraftV1['sections'],
): string {
  return claimsForSection(draft, section).map(claim => claim.text).join('\n');
}

export function contentFromNicoleProDraft(
  draft: NicoleProDraftV1,
  poseName: string,
): CueReviewContent {
  const evidence = draft.evidence[0];
  if (!evidence) throw new Error('Nicole-Pro draft has no primary evidence.');
  const headline = evidence.metricId === 'shoulder_horizontal'
    ? 'Schulterlinie – Nicole-Pro'
    : evidence.metricId === 'projected_hip_line_obliquity'
      ? 'Beckenlinie – Nicole-Pro'
      : 'Rumpfachse – Nicole-Pro';
  const hypotheses = claimsForSection(draft, 'hypotheses')
    .map((claim, index) => `${index + 1}. ${claim.text}`).join('\n');
  const tests = claimsForSection(draft, 'differentiationTests').map(claim => {
    const hypothesisNumbers = claim.relatedClaimIds
      .map(id => claimsForSection(draft, 'hypotheses').findIndex(item => item.claimId === id) + 1)
      .filter(index => index > 0);
    return `Test zu Hypothese ${hypothesisNumbers.join(', ')}: ${claim.text}`;
  }).join('\n');
  const targetClaims = claimsForSection(draft, 'targetAndPractice');
  const textOfType = (type: NicoleProClaimV1['type']) => targetClaims
    .filter(claim => claim.type === type).map(claim => claim.text).join('\n');
  return cloneFreeze({
    poseName,
    status: evidence.teacherSignal.state === 'strong_attention' ? 'CORRECTION' : 'WARNING',
    headline,
    cueMetaphor: joinedClaimText(draft, 'metaphor'),
    jointFocusId: evidence.metricId === 'shoulder_horizontal'
      ? 'shoulder_line'
      : evidence.metricId === 'projected_hip_line_obliquity'
        ? 'pelvis_core'
        : 'spine_center',
    diagnosisText: [
      `BEFUND\n${joinedClaimText(draft, 'finding')}`,
      `BIOMECHANISCHE EINORDNUNG\n${joinedClaimText(draft, 'interpretation')}`,
      `MÖGLICHE ERKLÄRUNGEN\n${hypotheses}`,
      `SO PRÜFST DU ES\n${tests}`,
    ].join('\n\n'),
    goalText: [textOfType('teaching_target'), textOfType('immediate_cue'), textOfType('success_criterion')]
      .filter(Boolean).join('\n\n'),
    practiceText: textOfType('practice'),
    technicalAnalysis: [
      joinedClaimText(draft, 'measurementDetails'),
      `Frame ${(evidence.mediaTimeUs / 1_000_000).toFixed(3)}s · ${evidence.metricId} · ${evidence.definitionVersion}`,
      `Quelle ${evidence.sourceId} · Policy ${evidence.policyVersion}`,
      `Modell ${evidence.landmarkQuality.modelId}@${evidence.landmarkQuality.modelVersion}`,
      `Artifact ${evidence.analysisArtifactId}`,
      `Planner ${draft.plannerId}@${draft.plannerVersion} · Validator ${draft.validatorVersion}`,
    ].join('\n\n'),
  });
}

const ALLOWED_TARGETS_BY_PRO_METRIC = Object.freeze({
  spine_tilt_aplomb: new Set([
    'bone.neck_sternum', 'bone.sternum_navel', 'bone.navel_pelvis',
    'bone.torso_side_l', 'bone.torso_side_r',
  ]),
  shoulder_horizontal: new Set(['bone.shoulder_line']),
  projected_hip_line_obliquity: new Set(['bone.pelvis_line']),
});

export function createNicoleProCueReviewAudit(input: {
  draft: NicoleProDraftV1;
  target: SelectedSkeletonTarget;
  poseName: string;
  currentContext: AnalysisContextEpochV1;
  context?: CueReviewCommandContext;
}): CueReviewAudit {
  const commandContext = input.context ?? defaultCueReviewContext();
  const content = contentFromNicoleProDraft(input.draft, input.poseName);
  const evidence = input.draft.evidence.length === 1 ? input.draft.evidence[0] : null;
  const allowedTargets = evidence
    ? ALLOWED_TARGETS_BY_PRO_METRIC[evidence.metricId as keyof typeof ALLOWED_TARGETS_BY_PRO_METRIC]
    : undefined;
  const registryRules = new Map(
    NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_V1.rules.map(rule => [rule.ruleId, rule]),
  );
  const authority = evidence ? createNicoleProValidationAuthority({
    currentContext: input.currentContext,
    assessment: {
      schemaVersion: 1,
      contextFingerprint: input.currentContext.fingerprint,
      contextGeneration: input.currentContext.generation,
      value: {
        analysisArtifactId: evidence.analysisArtifactId,
        sourceId: evidence.sourceId,
        exerciseId: evidence.exerciseId,
        policyVersion: evidence.policyVersion,
        evidence: input.draft.evidence,
      },
    },
  }) : null;
  if (!evidence || input.draft.reviewState !== 'pending_nicole'
    || input.draft.learnerVisible !== false || input.draft.parentVisible !== false
    || input.target.frameStatus !== 'exact_cache_frame'
    || input.target.sourceId !== evidence.sourceId
    || input.target.mediaTimeUs !== evidence.mediaTimeUs
    || evidence.landmarkQuality.modelId !== NICOLE_PRO_LANDMARK_MODEL_V1.modelId
    || evidence.landmarkQuality.modelVersion !== NICOLE_PRO_LANDMARK_MODEL_V1.modelVersion
    || evidence.analysisArtifactId !== createNicoleProExactFrameArtifactId(
      input.currentContext, evidence.mediaTimeUs, NICOLE_PRO_LANDMARK_MODEL_V1,
    )
    || !allowedTargets?.has(input.target.targetId)
    || input.draft.policyVersion !== evidence.policyVersion
    || input.draft.knowledgeRules.length === 0
    || input.draft.knowledgeRules.some(rule => canonicalJson(rule) !== canonicalJson(registryRules.get(rule.ruleId)))
    || !authority || !validateNicoleProDraft(input.draft, authority, input.currentContext).valid
    || !validateStoredNicoleProDraft(
      input.draft,
      NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
      NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
    ).valid
    || content.jointFocusId !== (evidence.metricId === 'shoulder_horizontal'
      ? 'shoulder_line'
      : evidence.metricId === 'projected_hip_line_obliquity' ? 'pelvis_core' : 'spine_center')) {
    throw new Error('Nicole-Pro draft is not bound to one supported exact-frame origin.');
  }
  const origin = originWithDigest({
    originId: commandContext.createId('origin'),
    kind: 'nicole_pro_draft',
    integrity: 'verified_application_snapshot',
    videoSourceId: evidence.sourceId,
    anchor: { mediaTimeUs: evidence.mediaTimeUs, targetId: input.target.targetId },
    generatedAt: input.draft.generatedAt,
    generatorId: `${input.draft.plannerId}@${input.draft.plannerVersion}`,
    policyVersion: input.draft.policyVersion,
    originalContent: cloneFreeze(content),
    nicoleProPayload: cloneFreeze({
      draft: input.draft,
      knowledgeRegistryId: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_ID,
      knowledgeRegistryVersion: NICOLE_PRO_TRUSTED_KNOWLEDGE_REGISTRY_VERSION,
      ruleVersions: input.draft.knowledgeRules.map(rule => ({ ruleId: rule.ruleId, version: rule.version })),
    }),
  });
  const revision = revisionWithDigest(content, 1, 1, null, commandContext);
  const recordId = commandContext.createId('record');
  const shell = {
    schemaVersion: 1 as const,
    recordId,
    recordDigest: sha256Canonical({ schemaVersion: 1, recordId, originId: origin.originId }),
    origin,
  };
  const events: CueReviewAuditEvent[] = [];
  events.push(event('revision_created', shell, revision.revisionId, revision.revisionDigest, commandContext, {}, events));
  return cloneFreeze({ ...shell, revisions: [revision], currentRevisionId: revision.revisionId, events });
}

/** Stable semantic identity; intentionally excludes generated IDs/timestamps. */
export function nicoleProImmutableOriginKey(audit: CueReviewAudit): string | null {
  if (audit.origin.kind !== 'nicole_pro_draft' || !audit.origin.nicoleProPayload) return null;
  const draft = audit.origin.nicoleProPayload.draft;
  return sha256Canonical({
    videoSourceId: audit.origin.videoSourceId,
    anchor: audit.origin.anchor,
    policyVersion: audit.origin.policyVersion,
    generatorId: audit.origin.generatorId,
    originalContent: audit.origin.originalContent,
    knowledgeRegistryId: audit.origin.nicoleProPayload.knowledgeRegistryId,
    knowledgeRegistryVersion: audit.origin.nicoleProPayload.knowledgeRegistryVersion,
    ruleVersions: audit.origin.nicoleProPayload.ruleVersions,
    draft: {
      ...draft,
      draftId: undefined,
      generatedAt: undefined,
    },
  });
}

export function createGroundedCueReviewAudit(input: {
  draft: ReadyGroundedTeacherDraft;
  target: SelectedSkeletonTarget;
  content: CueReviewContent;
  context?: CueReviewCommandContext;
}): CueReviewAudit {
  const context = input.context ?? defaultCueReviewContext();
  if (input.target.frameStatus !== 'exact_cache_frame'
    || input.target.sourceId !== input.draft.evidence.sourceId
    || input.target.mediaTimeUs !== input.draft.evidence.mediaTimeUs
    || input.target.streamEpoch !== input.draft.evidence.streamEpoch
    || input.target.generation !== input.draft.evidence.generation) {
    throw new Error('Grounded draft and selected exact frame do not share one identity.');
  }
  const allowedTargetsByMetric = {
    spine_tilt_aplomb: new Set([
      'bone.neck_sternum', 'bone.sternum_navel', 'bone.navel_pelvis',
      'bone.torso_side_l', 'bone.torso_side_r',
    ]),
    shoulder_horizontal: new Set(['bone.shoulder_line']),
    projected_hip_line_obliquity: new Set(['bone.pelvis_line']),
  } as const;
  const allowedTargets = allowedTargetsByMetric[input.draft.evidence.metricId];
  if (
    !allowedTargets.has(input.target.targetId)
    || input.content.jointFocusId !== input.draft.target
  ) {
    throw new Error('Grounded teacher draft requires its supported exact line target.');
  }
  const origin = originWithDigest({
    originId: context.createId('origin'),
    kind: 'grounded_ai_draft',
    integrity: 'verified_application_snapshot',
    videoSourceId: input.draft.evidence.sourceId,
    anchor: { mediaTimeUs: input.draft.evidence.mediaTimeUs, targetId: input.target.targetId },
    generatedAt: context.now(), generatorId: 'balletos-grounded-teacher-draft-v2',
    policyVersion: input.draft.evidence.policyVersion,
    originalContent: cloneFreeze(input.content),
    groundedPayload: cloneFreeze({ evidence: input.draft.evidence, sections: input.draft.sections, guide: input.draft.guide }),
  });
  const revision = revisionWithDigest(input.content, 1, 1, null, context);
  const recordId = context.createId('record');
  const shell = { schemaVersion: 1 as const, recordId, recordDigest: sha256Canonical({ schemaVersion: 1, recordId, originId: origin.originId }), origin };
  const initialEvents: CueReviewAuditEvent[] = [];
  initialEvents.push(event('revision_created', shell, revision.revisionId, revision.revisionDigest, context, {}, initialEvents));
  return cloneFreeze({
    ...shell,
    revisions: [revision], currentRevisionId: revision.revisionId,
    events: initialEvents,
  });
}

export function createLegacyCueReviewAudit(input: {
  recordId: string;
  videoSourceId: string;
  mediaTimeUs: number;
  targetId: string;
  originalContent: CueReviewContent;
  currentContent: CueReviewContent;
  legacyPayload: Readonly<Record<string, unknown>>;
  wasRejected: boolean;
  generatedAt?: string;
  policyVersion?: string;
  context?: CueReviewCommandContext;
}): CueReviewAudit {
  const context = input.context ?? defaultCueReviewContext('legacy-migration');
  const origin = originWithDigest({
    originId: context.createId('origin'), kind: 'legacy_unverified', integrity: 'legacy_unverified',
    videoSourceId: input.videoSourceId,
    anchor: { mediaTimeUs: input.mediaTimeUs, targetId: input.targetId },
    generatedAt: input.generatedAt ?? context.now(), generatorId: 'balletos-legacy-import-v1',
    policyVersion: input.policyVersion ?? 'legacy-unverified',
    originalContent: cloneFreeze(input.originalContent), legacyPayload: cloneFreeze(input.legacyPayload),
  });
  const revision = revisionWithDigest(input.currentContent, 1, 1, null, context);
  const shell = {
    schemaVersion: 1 as const, recordId: input.recordId,
    recordDigest: sha256Canonical({ schemaVersion: 1, recordId: input.recordId, originId: origin.originId }), origin,
  };
  const events: CueReviewAuditEvent[] = [];
  events.push(event('revision_created', shell, revision.revisionId, revision.revisionDigest, context, {}, events));
  events.push(event('legacy_import', shell, revision.revisionId, revision.revisionDigest, context, { reason: 'legacy_migration' }, events));
  if (input.wasRejected) events.push(event('rejected', shell, revision.revisionId, revision.revisionDigest, context, {}, events));
  return cloneFreeze({ ...shell, revisions: [revision], currentRevisionId: revision.revisionId, events });
}

function currentRevision(audit: CueReviewAudit): CueTeacherRevision {
  const revision = audit.revisions.find(item => item.revisionId === audit.currentRevisionId);
  if (!revision) throw new Error('Cue audit current revision is missing.');
  return revision;
}

export function projectCueReviewAudit(audit: CueReviewAudit): CueReviewProjection {
  if (!cueReviewAuditIsValid(audit)) throw new Error('Cue review audit is invalid.');
  const revision = currentRevision(audit);
  const decisionEvents = audit.events.filter(item => item.revisionId === revision.revisionId
    && (item.type === 'approved' || item.type === 'rejected' || item.type === 'reopened'));
  const latestDecision = decisionEvents[decisionEvents.length - 1];
  const decision = latestDecision?.type;
  const isArchived = audit.events.some(item => item.type === 'archived');
  const isApproved = decision === 'approved' && !isArchived;
  const audienceVisible = (audience: CueAudience) => {
    if (!isApproved || !cueReviewContentIsAudienceEligible(audit, revision.content)) return false;
    const audienceEvents = audit.events.filter(item => item.revisionId === revision.revisionId
      && item.audience === audience
      && (item.type === 'audience_granted' || item.type === 'audience_revoked'));
    const latest = audienceEvents[audienceEvents.length - 1];
    return latest?.type === 'audience_granted'
      && latestDecision !== undefined
      && latest.eventSequence > latestDecision.eventSequence;
  };
  return cloneFreeze({
    content: revision.content,
    provenance: decision === 'rejected'
      ? 'nicole_rejected'
      : isApproved
        ? revision.contentVersion > 1 ? 'nicole_edited' : 'nicole_confirmed'
        : 'nicole_draft',
    learnerVisible: audienceVisible('learner'),
    parentVisible: audienceVisible('parent'),
    revisionNumber: revision.revisionNumber,
    isApproved,
  });
}

export function projectCueReviewForAudience(
  audit: CueReviewAudit,
  audience: CueAudience,
): CueAudienceProjection | null {
  const projection = projectCueReviewAudit(audit);
  const allowed = audience === 'learner' ? projection.learnerVisible : projection.parentVisible;
  if (!allowed || !cueReviewContentIsAudienceEligible(audit, projection.content)) return null;
  return cloneFreeze({
    recordId: audit.recordId,
    revisionId: audit.currentRevisionId,
    audience,
    poseName: projection.content.poseName,
    headline: projection.content.headline,
    cueMetaphor: projection.content.cueMetaphor,
    goalText: projection.content.goalText,
    practiceText: projection.content.practiceText,
  });
}

const FORBIDDEN_AUDIENCE_LANGUAGE = Object.freeze([
  /\bdiagnos(?:e|tisch|tiziert?)\w*/iu,
  /\bdifferentialdiagnos\w*/iu,
  /\b(?:verletz\w*|läsion\w*|syndrom\w*|patholog\w*|entzünd\w*|sehnenriss\w*)\b/iu,
  /\b(?:schmerz\w*|gewebelast\w*|verletzungsrisik\w*|prognos\w*)\b/iu,
  /\b(?:psoas\w*|rotatorenmanschett\w*|tiefe\s+muskulatur|kraftdefizit\w*|muskelursache\w*)\b/iu,
  /\b(?:muskel\w*\s+(?:ist|sind|sei)\s+(?:geschwächt|verkürzt)|rein\s+muskulär)\b/iu,
  /\b(?:skoliose\w*|menisk\w*|arthrose\w*|fraktur\w*|impingement\w*|luxation\w*|tendinopath\w*)\b/iu,
  /\b(?:gluteus\w*|adduktor\w*|abduktor\w*|quadrizeps\w*|hamstring\w*|ischiocrural\w*|hüftmuskulatur\w*)\b[^\n.]{0,45}\b(?:schwach\w*|verkürzt\w*|zu\s+kurz|defizit\w*|ursäch\w*)\b/iu,
  /\b(?:immer|nie|garantiert|zweifelsfrei|eindeutig|100\s*%)\b/iu,
  /\b(?:ist|sind)\s+(?:die\s+)?ursache\b|\bverursach\w*\b|\bführt\s+(?:sicher\s+)?zu\b/iu,
]);

export function cueReviewContentIsAudienceSafe(content: CueReviewContent): boolean {
  const externalCopy = [
    content.poseName,
    content.headline,
    content.cueMetaphor,
    content.goalText,
    content.practiceText,
  ].filter((value): value is string => typeof value === 'string').join('\n');
  return !FORBIDDEN_AUDIENCE_LANGUAGE.some(pattern => pattern.test(externalCopy));
}

function audienceCopy(content: CueReviewContent): Readonly<{
  poseName: string;
  headline: string;
  cueMetaphor: string;
  goalText?: string;
  practiceText?: string;
}> {
  return {
    poseName: content.poseName,
    headline: content.headline,
    cueMetaphor: content.cueMetaphor,
    goalText: content.goalText,
    practiceText: content.practiceText,
  };
}

/**
 * E1 publishes only product-owned outward copy captured in a verified origin.
 * Teacher edits to outward fields require the dedicated student-derivation
 * workflow; internal diagnosis/hypothesis/technical edits may remain private.
 */
export function cueReviewContentIsAudienceEligible(
  audit: CueReviewAudit,
  content: CueReviewContent,
): boolean {
  return audit.origin.integrity === 'verified_application_snapshot'
    && (audit.origin.kind === 'grounded_ai_draft' || audit.origin.kind === 'nicole_pro_draft')
    && canonicalJson(audienceCopy(content)) === canonicalJson(audienceCopy(audit.origin.originalContent))
    && cueReviewContentIsAudienceSafe(content);
}

export function cueReviewExpectedState(audit: CueReviewAudit): CueReviewExpectedState {
  if (!cueReviewAuditIsValid(audit)) throw new Error('Cue review audit is invalid.');
  return cloneFreeze({
    revisionId: audit.currentRevisionId,
    lastEventDigest: audit.events[audit.events.length - 1]?.eventDigest ?? '',
  });
}

function assertExpectedState(audit: CueReviewAudit, expected: CueReviewExpectedState): void {
  const current = cueReviewExpectedState(audit);
  if (current.revisionId !== expected.revisionId || current.lastEventDigest !== expected.lastEventDigest) {
    throw new Error('Cue review changed since it was displayed. Reload the current revision.');
  }
}

const REFERENCE_IMAGE_KEYS = new Set(['plie_knie_korrekt', 'port_de_bras_ideal', 'epaulement_ideal']);
const EDITABLE_CONTENT_KEYS = new Set([
  'poseName', 'status', 'headline', 'cueMetaphor', 'diagnosisText', 'diagnosisMetaphor',
  'goalText', 'practiceText', 'technicalAnalysis', 'referenceImageKey', 'nicoleAction',
]);

export function reviseCueReviewAudit(
  audit: CueReviewAudit,
  patch: CueReviewEditablePatch,
  expected: CueReviewExpectedState,
  context: CueReviewCommandContext = defaultCueReviewContext(),
): CueReviewAudit {
  assertExpectedState(audit, expected);
  const previous = currentRevision(audit);
  const forbiddenKeys = Object.keys(patch).filter(key => !EDITABLE_CONTENT_KEYS.has(key));
  if (forbiddenKeys.length > 0) throw new Error(`Cue review patch contains forbidden fields: ${forbiddenKeys.join(', ')}`);
  if (patch.referenceImageKey !== undefined && !REFERENCE_IMAGE_KEYS.has(patch.referenceImageKey)) {
    throw new Error('Unknown reference image key.');
  }
  const content: CueReviewContent = { ...previous.content, ...patch };
  if (previous.contentDigest === sha256Canonical(content)) return audit;
  const revision = revisionWithDigest(content, previous.revisionNumber + 1, previous.contentVersion + 1, previous.revisionId, context);
  const auditBase = { origin: audit.origin };
  const nextEvents = [...audit.events];
  for (const audience of ['learner', 'parent'] as CueAudience[]) {
    nextEvents.push(event(
      'audience_revoked', auditBase, previous.revisionId, previous.revisionDigest, context,
      { audience, reason: 'superseded_by_revision' }, nextEvents,
    ));
  }
  nextEvents.push(event('revision_created', auditBase, revision.revisionId, revision.revisionDigest, context, {}, nextEvents));
  return cloneFreeze({
    ...audit,
    revisions: [...audit.revisions, revision], currentRevisionId: revision.revisionId,
    events: nextEvents,
  });
}

function appendDecision(
  audit: CueReviewAudit,
  type: 'approved' | 'rejected' | 'reopened',
  expected: CueReviewExpectedState,
  context: CueReviewCommandContext = defaultCueReviewContext(),
): CueReviewAudit {
  assertExpectedState(audit, expected);
  const revision = currentRevision(audit);
  const projection = projectCueReviewAudit(audit);
  if (type === 'approved' && (projection.isApproved || projection.provenance === 'nicole_rejected')) {
    throw new Error('Only a pending review can be approved.');
  }
  if (type === 'rejected' && (projection.isApproved || projection.provenance === 'nicole_rejected')) {
    throw new Error('Only a pending review can be rejected.');
  }
  if (type === 'reopened' && !projection.isApproved && projection.provenance !== 'nicole_rejected') {
    throw new Error('Only an approved or rejected review can be reopened.');
  }
  return cloneFreeze({
    ...audit,
    events: [...audit.events, event(type, audit, revision.revisionId, revision.revisionDigest, context, {}, audit.events)],
  });
}

export const approveCueReviewAudit = (audit: CueReviewAudit, expected: CueReviewExpectedState, context?: CueReviewCommandContext) => appendDecision(audit, 'approved', expected, context);
export const rejectCueReviewAudit = (audit: CueReviewAudit, expected: CueReviewExpectedState, context?: CueReviewCommandContext) => appendDecision(audit, 'rejected', expected, context);
export const reopenCueReviewAudit = (audit: CueReviewAudit, expected: CueReviewExpectedState, context?: CueReviewCommandContext) => appendDecision(audit, 'reopened', expected, context);

export function setCueReviewAudience(
  audit: CueReviewAudit,
  audience: CueAudience,
  visible: boolean,
  expected: CueReviewExpectedState,
  context: CueReviewCommandContext = defaultCueReviewContext(),
): CueReviewAudit {
  assertExpectedState(audit, expected);
  const projection = projectCueReviewAudit(audit);
  if (!projection.isApproved && visible) throw new Error('Only an approved current revision can be published.');
  if (visible && !cueReviewContentIsAudienceEligible(audit, projection.content)) {
    throw new Error('The current teacher revision requires a separate safe student derivation before publication.');
  }
  const revision = currentRevision(audit);
  return cloneFreeze({
    ...audit,
    events: [...audit.events, event(visible ? 'audience_granted' : 'audience_revoked', audit, revision.revisionId, revision.revisionDigest, context, {
      audience, reason: 'teacher_action',
    }, audit.events)],
  });
}

function nicoleProPayloadIsValid(value: unknown): value is NicoleProAiOriginPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as NicoleProAiOriginPayload;
  const draft = payload.draft;
  const archivedRegistry = resolveNicoleProTrustedKnowledgeRegistry(
    payload.knowledgeRegistryId,
    payload.knowledgeRegistryVersion,
  );
  if (!archivedRegistry
    || !Array.isArray(payload.ruleVersions) || !draft || typeof draft !== 'object'
    || draft.schemaVersion !== 1 || typeof draft.draftId !== 'string'
    || typeof draft.plannerId !== 'string' || typeof draft.plannerVersion !== 'string'
    || typeof draft.validatorVersion !== 'string' || typeof draft.policyVersion !== 'string'
    || typeof draft.generatedAt !== 'string' || draft.reviewState !== 'pending_nicole'
    || draft.learnerVisible !== false || draft.parentVisible !== false
    || !Array.isArray(draft.evidence) || draft.evidence.length !== 1
    || !Array.isArray(draft.knowledgeRules) || draft.knowledgeRules.length === 0
    || !Array.isArray(draft.claims) || draft.claims.length === 0
    || !draft.sections || typeof draft.sections !== 'object') return false;
  const evidence = draft.evidence[0];
  if (!evidence || typeof evidence !== 'object' || typeof evidence.evidenceId !== 'string'
    || typeof evidence.analysisArtifactId !== 'string' || typeof evidence.sourceId !== 'string'
    || !Number.isFinite(evidence.mediaTimeUs) || typeof evidence.metricId !== 'string'
    || typeof evidence.definitionVersion !== 'string' || typeof evidence.policyVersion !== 'string'
    || !evidence.landmarkQuality || typeof evidence.landmarkQuality.modelId !== 'string'
    || typeof evidence.landmarkQuality.modelVersion !== 'string') return false;
  if (!draft.knowledgeRules.every(rule => rule && typeof rule === 'object'
      && typeof rule.ruleId === 'string' && typeof rule.version === 'string'
      && Array.isArray(rule.statements))
    || !draft.claims.every(claim => claim && typeof claim === 'object'
      && typeof claim.claimId === 'string' && typeof claim.text === 'string'
      && typeof claim.type === 'string' && typeof claim.statementId === 'string'
      && Array.isArray(claim.evidenceIds) && Array.isArray(claim.knowledgeRuleIds)
      && Array.isArray(claim.relatedClaimIds))) return false;
  const sectionKeys: readonly (keyof NicoleProDraftV1['sections'])[] = [
    'finding', 'interpretation', 'hypotheses', 'differentiationTests',
    'targetAndPractice', 'metaphor', 'measurementDetails',
  ];
  if (!sectionKeys.every(key => Array.isArray(draft.sections[key])
      && draft.sections[key].every(item => typeof item === 'string'))) return false;
  const expectedRuleVersions = draft.knowledgeRules.map(rule => ({ ruleId: rule.ruleId, version: rule.version }));
  const trustedRules = new Map(archivedRegistry.rules.map(rule => [rule.ruleId, rule]));
  return canonicalJson(payload.ruleVersions) === canonicalJson(expectedRuleVersions)
    && draft.knowledgeRules.every(rule => canonicalJson(rule) === canonicalJson(trustedRules.get(rule.ruleId)))
    && validateStoredNicoleProDraft(
      draft,
      payload.knowledgeRegistryId,
      payload.knowledgeRegistryVersion,
    ).valid;
}

export function cueReviewAuditIsValid(audit: unknown): audit is CueReviewAudit {
 try {
  if (!audit || typeof audit !== 'object') return false;
  const candidate = audit as CueReviewAudit;
  if (candidate.schemaVersion !== 1 || !candidate.origin || !Array.isArray(candidate.revisions) || !Array.isArray(candidate.events)) return false;
  if (typeof candidate.recordId !== 'string' || typeof candidate.recordDigest !== 'string'
    || typeof candidate.origin !== 'object' || !Number.isFinite(candidate.origin.anchor?.mediaTimeUs)
    || typeof candidate.origin.videoSourceId !== 'string' || typeof candidate.origin.anchor?.targetId !== 'string'
    || Object.prototype.hasOwnProperty.call(candidate, 'archived')) return false;
  if (!candidate.revisions.every(item => item !== null && typeof item === 'object')
    || !candidate.events.every(item => item !== null && typeof item === 'object')) return false;
  const originKinds = new Set(['grounded_ai_draft', 'nicole_pro_draft', 'legacy_ai_suggestion', 'legacy_unverified']);
  const integrities = new Set(['verified_application_snapshot', 'legacy_unverified']);
  if (!originKinds.has(candidate.origin.kind) || !integrities.has(candidate.origin.integrity)
    || typeof candidate.origin.originId !== 'string' || typeof candidate.origin.generatedAt !== 'string'
    || typeof candidate.origin.generatorId !== 'string' || typeof candidate.origin.policyVersion !== 'string') return false;
  if (candidate.recordDigest !== sha256Canonical({ schemaVersion: 1, recordId: candidate.recordId, originId: candidate.origin.originId })) return false;
  const { originDigest: _digest, digestAlgorithm: _algorithm, ...originInput } = candidate.origin;
  if (candidate.origin.digestAlgorithm !== DIGEST_ALGORITHM || candidate.origin.originDigest !== sha256Canonical(originInput)) return false;
  if (candidate.revisions.length === 0 || candidate.currentRevisionId !== candidate.revisions[candidate.revisions.length - 1].revisionId) return false;
  if (new Set(candidate.revisions.map(item => item.revisionId)).size !== candidate.revisions.length
    || new Set(candidate.events.map(item => item.eventId)).size !== candidate.events.length) return false;
  const statuses = new Set(['GOOD', 'CORRECTION', 'WARNING', 'NEUTRAL']);
  const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
  const contentIsValid = (content: unknown): content is CueReviewContent => {
    if (!content || typeof content !== 'object') return false;
    const value = content as CueReviewContent;
    return typeof value.poseName === 'string' && statuses.has(value.status)
      && typeof value.headline === 'string' && typeof value.cueMetaphor === 'string'
      && typeof value.jointFocusId === 'string'
      && optionalString(value.diagnosisText) && optionalString(value.diagnosisMetaphor)
      && optionalString(value.goalText) && optionalString(value.practiceText)
      && optionalString(value.technicalAnalysis)
      && (value.referenceImageKey === undefined || REFERENCE_IMAGE_KEYS.has(value.referenceImageKey))
      && (value.nicoleAction === undefined || value.nicoleAction === 'strength' || value.nicoleAction === 'correction');
  };
  if (!contentIsValid(candidate.origin.originalContent)) return false;
  if (candidate.origin.kind === 'grounded_ai_draft' && (
    candidate.origin.integrity !== 'verified_application_snapshot' || !candidate.origin.groundedPayload
    || candidate.origin.nicoleProPayload !== undefined
  )) return false;
  if (candidate.origin.kind === 'nicole_pro_draft' && (
    candidate.origin.integrity !== 'verified_application_snapshot'
    || !nicoleProPayloadIsValid(candidate.origin.nicoleProPayload)
    || candidate.origin.groundedPayload !== undefined
    || candidate.origin.nicoleProPayload.draft.evidence[0].sourceId !== candidate.origin.videoSourceId
    || candidate.origin.nicoleProPayload.draft.evidence[0].mediaTimeUs !== candidate.origin.anchor.mediaTimeUs
    || candidate.origin.nicoleProPayload.draft.policyVersion !== candidate.origin.policyVersion
    || `${candidate.origin.nicoleProPayload.draft.plannerId}@${candidate.origin.nicoleProPayload.draft.plannerVersion}` !== candidate.origin.generatorId
    || canonicalJson(candidate.origin.originalContent) !== canonicalJson(contentFromNicoleProDraft(
      candidate.origin.nicoleProPayload.draft,
      candidate.origin.originalContent.poseName,
    ))
  )) return false;
  if (candidate.origin.kind === 'legacy_unverified' && (
    candidate.origin.integrity !== 'legacy_unverified' || !candidate.origin.legacyPayload
    || candidate.origin.nicoleProPayload !== undefined
  )) return false;
  const revisionsValid = candidate.revisions.every((revision, index) => (
    revision.revisionNumber === index + 1
    && revision.contentVersion === index + 1
    && revision.contentSchemaVersion === 1
    && typeof revision.revisionId === 'string' && typeof revision.actorId === 'string' && typeof revision.createdAt === 'string'
    && contentIsValid(revision.content)
    && revision.digestAlgorithm === DIGEST_ALGORITHM
    && revision.contentDigest === sha256Canonical(revision.content)
    && revision.revisionDigest === sha256Canonical(Object.fromEntries(Object.entries(revision).filter(([key]) => key !== 'revisionDigest')))
    && (index === 0 ? revision.parentRevisionId === null : revision.parentRevisionId === candidate.revisions[index - 1].revisionId)
  ));
  if (!revisionsValid) return false;
  const revisionIds = new Set(candidate.revisions.map(revision => revision.revisionId));
  const eventTypes = new Set([
    'revision_created', 'approved', 'rejected', 'reopened', 'audience_granted',
    'audience_revoked', 'archived', 'legacy_import',
  ]);
  const structurallyValid = candidate.events.every((auditEvent, index) => {
    const { eventDigest: _eventDigest, digestAlgorithm: _digestAlgorithm, ...eventCore } = auditEvent;
    const audienceEvent = auditEvent.type === 'audience_granted' || auditEvent.type === 'audience_revoked';
    return eventTypes.has(auditEvent.type)
      && typeof auditEvent.eventId === 'string' && typeof auditEvent.actorId === 'string' && typeof auditEvent.at === 'string'
      && (audienceEvent ? auditEvent.audience === 'learner' || auditEvent.audience === 'parent' : auditEvent.audience === undefined)
      && auditEvent.eventSequence === index + 1
      && auditEvent.originId === candidate.origin.originId
      && revisionIds.has(auditEvent.revisionId)
      && auditEvent.revisionDigest === candidate.revisions.find(item => item.revisionId === auditEvent.revisionId)?.revisionDigest
      && auditEvent.previousEventDigest === (index === 0 ? null : candidate.events[index - 1].eventDigest)
      && auditEvent.digestAlgorithm === DIGEST_ALGORITHM
      && auditEvent.eventDigest === sha256Canonical(eventCore);
  });
  if (!structurallyValid) return false;

  const created = new Set<string>();
  const state = new Map<string, 'pending' | 'approved' | 'rejected'>();
  let archived = false;
  for (const auditEvent of candidate.events) {
    if (archived && auditEvent.type !== 'audience_revoked') return false;
    if (auditEvent.type === 'revision_created') {
      if (created.has(auditEvent.revisionId)) return false;
      created.add(auditEvent.revisionId); state.set(auditEvent.revisionId, 'pending'); continue;
    }
    if (!created.has(auditEvent.revisionId)) return false;
    const current = state.get(auditEvent.revisionId);
    if (auditEvent.type === 'approved') {
      if (current !== 'pending') return false;
      state.set(auditEvent.revisionId, 'approved');
    } else if (auditEvent.type === 'rejected') {
      if (current !== 'pending') return false;
      state.set(auditEvent.revisionId, 'rejected');
    } else if (auditEvent.type === 'reopened') {
      if (current !== 'approved' && current !== 'rejected') return false;
      state.set(auditEvent.revisionId, 'pending');
    } else if (auditEvent.type === 'audience_granted' && current !== 'approved') return false;
    else if (auditEvent.type === 'archived') {
      if (archived) return false;
      archived = true;
    }
  }
  return created.size === candidate.revisions.length;
 } catch {
   return false;
 }
}
