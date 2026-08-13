import type { BalletMotionId, MotionRegistryEntry } from '../types/motionRegistry';

const registry: readonly MotionRegistryEntry[] = [
  {
    id: 'plie', label: 'Plié in der 1. Position', shortLabel: 'Plié',
    aliases: ['plié', 'plie'], directions: ['not_applicable'],
    dataStatus: 'runtime_pose', phaseEngineStatus: 'assessment_ready', feedbackStatus: 'general_safe_draft',
    sourceIds: ['balletos-runtime-pose'],
    provenance: { pedagogicalStatus: 'runtime_observation', nicoleReviewStatus: 'not_reviewed', productStatus: 'runtime_allowed' },
  },
  {
    id: 'tendu', label: 'Battement Tendu', shortLabel: 'Tendu',
    aliases: ['battement tendu', 'tendu'], directions: ['outward'],
    dataStatus: 'technical_cohort_imported', phaseEngineStatus: 'assessment_ready', feedbackStatus: 'general_safe_draft',
    sourceIds: ['dryad-tendu-2025'],
    provenance: { pedagogicalStatus: 'technical_only', nicoleReviewStatus: 'not_reviewed', productStatus: 'technical_signal_only' },
  },
  {
    id: 'passe', label: 'Passé', shortLabel: 'Passé',
    aliases: ['passé', 'passe'], directions: ['working_leg'],
    dataStatus: 'technical_cohort_imported', phaseEngineStatus: 'technical_events_only', feedbackStatus: 'structure_pending',
    sourceIds: ['dryad-passe-2025'],
    provenance: { pedagogicalStatus: 'technical_only', nicoleReviewStatus: 'not_reviewed', productStatus: 'technical_signal_only' },
  },
  {
    id: 'jete', label: 'Jeté', shortLabel: 'Jeté',
    aliases: ['jeté', 'jete'], directions: ['outward'],
    dataStatus: 'technical_cohort_imported', phaseEngineStatus: 'technical_events_only', feedbackStatus: 'structure_pending',
    sourceIds: ['dryad-jete-2025'],
    provenance: { pedagogicalStatus: 'technical_only', nicoleReviewStatus: 'not_reviewed', productStatus: 'technical_signal_only' },
  },
  {
    id: 'changement', label: 'Changement', shortLabel: 'Changement',
    aliases: ['changement'], directions: ['vertical_jump'],
    dataStatus: 'technical_cohort_imported', phaseEngineStatus: 'technical_events_only', feedbackStatus: 'structure_pending',
    sourceIds: ['dryad-changement-2025'],
    provenance: { pedagogicalStatus: 'technical_only', nicoleReviewStatus: 'not_reviewed', productStatus: 'technical_signal_only' },
  },
].map(entry => Object.freeze({
  ...entry,
  aliases: Object.freeze(entry.aliases),
  directions: Object.freeze(entry.directions),
  sourceIds: Object.freeze(entry.sourceIds),
  provenance: Object.freeze(entry.provenance),
})) as readonly MotionRegistryEntry[];

export const MOTION_REGISTRY = Object.freeze(registry);

export function getMotionRegistryEntry(id: BalletMotionId): MotionRegistryEntry {
  const entry = MOTION_REGISTRY.find(candidate => candidate.id === id);
  if (!entry) throw new Error(`Motion registry is missing ${id}.`);
  return entry;
}

export function resolveMotionRegistryEntry(label: string): MotionRegistryEntry | null {
  const normalized = label.trim().toLocaleLowerCase('de-DE');
  return MOTION_REGISTRY.find(entry => (
    normalized === entry.id
    || normalized.includes(entry.label.toLocaleLowerCase('de-DE'))
    || entry.aliases.some(alias => normalized.includes(alias.toLocaleLowerCase('de-DE')))
  )) ?? null;
}

export function assessmentReadyMotions(): readonly MotionRegistryEntry[] {
  return MOTION_REGISTRY.filter(entry => entry.phaseEngineStatus === 'assessment_ready');
}
