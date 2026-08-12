import type { ReadyGroundedTeacherDraft } from '../types/groundedTeacherDraft';
import type { SelectedSkeletonTarget } from '../types/skeletonTarget';
import type {
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
  target: SelectedSkeletonTarget,
  poseName: string,
): CueReviewContent {
  return cloneFreeze({
    poseName,
    status: 'NEUTRAL',
    headline: 'Rumpfachse – Nicole prüft',
    cueMetaphor: draft.sections.metaphor,
    jointFocusId: 'spine_center',
    diagnosisText: `${draft.sections.what}\n\n${draft.sections.whyConditional}`,
    goalText: draft.sections.goalConditional,
    practiceText: draft.sections.practiceForTeacherReview,
    technicalAnalysis: `${draft.sections.technical}\n\n${draft.sections.limitations}\n\nQuellen: ${draft.sections.sourceRefs.join(' · ')}`,
    referenceImageKey: undefined,
    nicoleAction: undefined,
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
  const groundedTargetIds = new Set([
    'bone.neck_sternum', 'bone.sternum_navel', 'bone.navel_pelvis',
    'bone.torso_side_l', 'bone.torso_side_r',
  ]);
  if (!groundedTargetIds.has(input.target.targetId) || input.content.jointFocusId !== 'spine_center') {
    throw new Error('Grounded Aplomb draft requires a supported torso target.');
  }
  const origin = originWithDigest({
    originId: context.createId('origin'),
    kind: 'grounded_ai_draft',
    integrity: 'verified_application_snapshot',
    videoSourceId: input.draft.evidence.sourceId,
    anchor: { mediaTimeUs: input.draft.evidence.mediaTimeUs, targetId: input.target.targetId },
    generatedAt: context.now(), generatorId: 'balletos-grounded-teacher-draft-v1',
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
    if (!isApproved) return false;
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
  const revision = currentRevision(audit);
  return cloneFreeze({
    ...audit,
    events: [...audit.events, event(visible ? 'audience_granted' : 'audience_revoked', audit, revision.revisionId, revision.revisionDigest, context, {
      audience, reason: 'teacher_action',
    }, audit.events)],
  });
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
  const originKinds = new Set(['grounded_ai_draft', 'legacy_ai_suggestion', 'legacy_unverified']);
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
  )) return false;
  if (candidate.origin.kind === 'legacy_unverified' && (
    candidate.origin.integrity !== 'legacy_unverified' || !candidate.origin.legacyPayload
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
