import type { AgeGroup, Location } from '../types';

export type StudentRegistryEntry = Readonly<{
  studentId: string;
  displayName: string;
  selectionLabel: string;
  ageGroup: AgeGroup;
  location: Location;
  aliases: readonly string[];
  dataStatus: 'demo_profile';
}>;

function selectionKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Canonical identities currently exposed by the V1 demo UI.
 *
 * These entries are stable application IDs, not a production student
 * database. Personal, consent and course data stay outside this registry
 * until a dedicated repository and retention contract exist.
 */
export const STUDENT_REGISTRY: readonly StudentRegistryEntry[] = Object.freeze([
  Object.freeze({
    studentId: 'student:emma-berger',
    displayName: 'Emma Berger',
    selectionLabel: 'Emma Berger (Minis)',
    ageGroup: 'MINIS',
    location: 'MAINZ',
    aliases: Object.freeze(['emma', 'emma-berger', 'emma-berger-minis']),
    dataStatus: 'demo_profile',
  }),
  Object.freeze({
    studentId: 'student:clara-schulze',
    displayName: 'Clara Schulze',
    selectionLabel: 'Clara Schulze (Kids)',
    ageGroup: 'KIDS',
    location: 'MAINZ',
    aliases: Object.freeze(['clara', 'clara-schulze', 'clara-schulze-kids']),
    dataStatus: 'demo_profile',
  }),
  Object.freeze({
    studentId: 'student:sophie-mainz',
    displayName: 'Sophie Mainz',
    selectionLabel: 'Sophie Mainz (Teens)',
    ageGroup: 'TEENS',
    location: 'MAINZ',
    aliases: Object.freeze(['sophie', 'sophie-mainz', 'sophie-mainz-teens']),
    dataStatus: 'demo_profile',
  }),
  Object.freeze({
    studentId: 'student:mia-hoffmann',
    displayName: 'Mia Hoffmann',
    selectionLabel: 'Mia Hoffmann (Pro)',
    ageGroup: 'MASTERCLASS',
    location: 'ALZEY',
    aliases: Object.freeze(['mia', 'mia-hoffmann', 'mia-hoffmann-pro']),
    dataStatus: 'demo_profile',
  }),
]);

const STUDENT_BY_SELECTION = new Map<string, StudentRegistryEntry>();
for (const entry of STUDENT_REGISTRY) {
  for (const value of [entry.studentId, entry.displayName, entry.selectionLabel, ...entry.aliases]) {
    STUDENT_BY_SELECTION.set(selectionKey(value), entry);
  }
}

export function resolveStudentRegistryEntry(selection: string): StudentRegistryEntry | null {
  return STUDENT_BY_SELECTION.get(selectionKey(selection)) ?? null;
}

export function resolveStudentId(selection: string): string | null {
  return resolveStudentRegistryEntry(selection)?.studentId ?? null;
}
