import { describe, expect, it } from 'vitest';
import {
  resolveStudentId,
  resolveStudentRegistryEntry,
  STUDENT_REGISTRY,
} from '../services/studentRegistry';

describe('student registry', () => {
  it('resolves visible labels and legacy aliases to one stable application ID', () => {
    expect(resolveStudentId('Emma Berger')).toBe('student:emma-berger');
    expect(resolveStudentId('Emma Berger (Minis)')).toBe('student:emma-berger');
    expect(resolveStudentId('emma-berger-minis')).toBe('student:emma-berger');
    expect(resolveStudentRegistryEntry('student:emma-berger')).toMatchObject({
      displayName: 'Emma Berger',
      dataStatus: 'demo_profile',
    });
  });

  it('fails closed for unknown people and keeps the registry deeply immutable', () => {
    expect(resolveStudentId('Unbekannte Schülerin')).toBeNull();
    expect(Object.isFrozen(STUDENT_REGISTRY)).toBe(true);
    expect(STUDENT_REGISTRY.every(entry => Object.isFrozen(entry) && Object.isFrozen(entry.aliases))).toBe(true);
    expect(new Set(STUDENT_REGISTRY.map(entry => entry.studentId)).size).toBe(STUDENT_REGISTRY.length);
  });
});
