import { describe, expect, it } from 'vitest';
import {
  createTechnicalVideoManifest,
  technicalVideoManifestCanDriveSingleClock,
  technicalVideoManifestHistoryIsValid,
  technicalVideoManifestIsProductUsable,
  technicalVideoManifestIsValid,
} from '../services/technicalVideoManifest';
import type { TechnicalVideoManifestDraft } from '../types/technicalVideoManifest';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function draft(overrides: Partial<TechnicalVideoManifestDraft> = {}): TechnicalVideoManifestDraft {
  return {
    manifestId: 'handoff-v1', handoffId: 'gold-video-handoff', manifestVersion: 1, supersedesManifestId: null,
    createdAt: '2026-08-14T12:00:00.000Z', sourceKind: 'professional_video_handoff', displayLabel: 'Gold video technical handoff',
    assets: [{
      assetId: 'source-01', role: 'source_video', fileName: 'source.mp4', relativePath: 'videos/source.mp4',
      sha256: HASH_A, byteSize: 1234, mimeType: 'video/mp4', derivedFromAssetIds: [],
    }, {
      assetId: 'clip-01', role: 'technical_clip', fileName: 'clip.mp4', relativePath: 'clips/clip.mp4',
      sha256: HASH_B, byteSize: 567, mimeType: 'video/mp4', derivedFromAssetIds: ['source-01'],
    }],
    rights: { rightsBasis: 'unknown', licenseStatus: 'unknown', productUseStatus: 'not_assessed', releaseStatus: 'not_granted', rightsEvidenceStatus: 'missing' },
    technicalStatus: 'hash_verified', subjectMatterStatus: 'unreviewed', nicoleReferenceStatus: 'not_claimed',
    motionContext: { classificationStatus: 'not_claimed', exerciseId: null, phaseId: null, view: null, workingSide: null },
    clock: { assetId: 'source-01', status: 'declared', frameRateHz: 60, durationMs: 2400, mediaTimeOrigin: 'container_pts', driftToleranceMs: null },
    ...overrides,
  };
}

describe('technical video manifest', () => {
  it('creates a deeply frozen digest-bound technical handoff', () => {
    const manifest = createTechnicalVideoManifest(draft());
    expect(technicalVideoManifestIsValid(manifest)).toBe(true);
    expect(manifest.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.assets[0])).toBe(true);
    expect(Object.isFrozen(manifest.assets[1].derivedFromAssetIds)).toBe(true);
  });

  it('fails closed for malformed, unknown-key and digest-tampered values', () => {
    const manifest = createTechnicalVideoManifest(draft());
    expect(technicalVideoManifestIsValid(null)).toBe(false);
    expect(technicalVideoManifestIsValid({ ...manifest, surprise: true })).toBe(false);
    expect(technicalVideoManifestIsValid({ ...manifest, displayLabel: 'changed' })).toBe(false);
    expect(technicalVideoManifestIsValid({ ...manifest, manifestDigest: 'x'.repeat(64) })).toBe(false);
  });

  it.each(['/vault/source.mp4', '../source.mp4', 'C:/source.mp4', 'https://host/source.mp4', 'videos\\source.mp4', 'a/%2e%2e/source.mp4'])(
    'rejects non-package path %s', relativePath => {
      expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], relativePath }] }))).toThrow();
    },
  );

  it('rejects malformed hashes, empty files, duplicate paths and missing derivation parents', () => {
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], sha256: HASH_A.toUpperCase() }] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], byteSize: 0 }] }))).toThrow();
    const source = draft().assets[0];
    expect(() => createTechnicalVideoManifest(draft({ assets: [source, { ...source, assetId: 'source-02' }] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...source, derivedFromAssetIds: ['missing'] }] }))).toThrow();
  });

  it('requires at least one video asset and controlled MIME/role values', () => {
    const metadata = { ...draft().assets[0], role: 'metadata' as const, mimeType: 'application/json' as const, fileName: 'data.json', relativePath: 'data/data.json' };
    expect(() => createTechnicalVideoManifest(draft({ assets: [metadata] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], mimeType: 'application/octet-stream' as never }] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], fileName: 'source.png', relativePath: 'videos/source.png', mimeType: 'image/png' }] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...draft().assets[0], fileName: 'source.png', relativePath: 'videos/source.png' }] }))).toThrow();
  });

  it('rejects cyclic provenance and source assets with parents', () => {
    const [source, clip] = draft().assets;
    expect(() => createTechnicalVideoManifest(draft({ assets: [
      { ...source, role: 'technical_clip', derivedFromAssetIds: ['clip-01'] },
      { ...clip, derivedFromAssetIds: ['source-01'] },
    ] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ assets: [{ ...source, derivedFromAssetIds: ['clip-01'] }, clip] }))).toThrow();
  });

  it('keeps unknown rights fail-closed', () => {
    expect(technicalVideoManifestIsProductUsable(createTechnicalVideoManifest(draft()))).toBe(false);
    expect(() => createTechnicalVideoManifest(draft({
      rights: { rightsBasis: 'unknown', licenseStatus: 'verified', productUseStatus: 'allowed', releaseStatus: 'granted', rightsEvidenceStatus: 'verified' },
    }))).toThrow();
  });

  it('requires every rights axis before product use', () => {
    const rights = { rightsBasis: 'purchase_license' as const, licenseStatus: 'verified' as const, productUseStatus: 'allowed' as const, releaseStatus: 'granted' as const, rightsEvidenceStatus: 'verified' as const };
    const accepted = createTechnicalVideoManifest(draft({ rights, technicalStatus: 'technically_accepted' }));
    expect(technicalVideoManifestIsProductUsable(accepted)).toBe(true);
    expect(technicalVideoManifestIsProductUsable(createTechnicalVideoManifest(draft({ rights, technicalStatus: 'hash_verified' })))).toBe(false);
  });

  it('never permits a technical ingress manifest to claim Nicole authority', () => {
    const manifest = createTechnicalVideoManifest(draft());
    expect(manifest.nicoleReferenceStatus).toBe('not_claimed');
    expect(technicalVideoManifestIsValid({ ...manifest, nicoleReferenceStatus: 'nicole_approved' })).toBe(false);
  });

  it('does not accept guessed motion labels under not_claimed classification', () => {
    expect(() => createTechnicalVideoManifest(draft({
      motionContext: { classificationStatus: 'not_claimed', exerciseId: 'plie', phaseId: null, view: null, workingSide: null },
    }))).toThrow();
  });

  it('accepts controlled reviewed context and rejects invalid phase/exercise pairs', () => {
    expect(technicalVideoManifestIsValid(createTechnicalVideoManifest(draft({
      motionContext: { classificationStatus: 'technically_reviewed', exerciseId: 'plie', phaseId: 'bottom', view: 'frontal', workingSide: 'bilateral' },
    })))).toBe(true);
    expect(() => createTechnicalVideoManifest(draft({
      motionContext: { classificationStatus: 'technically_reviewed', exerciseId: 'passe', phaseId: 'bottom', view: 'frontal', workingSide: 'right' },
    }))).toThrow();
  });

  it('distinguishes declared from measured clock evidence', () => {
    const declared = createTechnicalVideoManifest(draft());
    expect(technicalVideoManifestCanDriveSingleClock(declared)).toBe(true);
    expect(() => createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, driftToleranceMs: 1 } }))).toThrow();
    const measured = createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, status: 'measured', driftToleranceMs: 0.5 } }));
    expect(technicalVideoManifestCanDriveSingleClock(measured)).toBe(true);
  });

  it('binds clock evidence to one existing video asset and bounded duration', () => {
    expect(() => createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, assetId: 'missing' } }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, assetId: 'metadata' }, assets: [
      ...draft().assets,
      { ...draft().assets[0], assetId: 'metadata', role: 'metadata', fileName: 'data.json', relativePath: 'data/data.json', mimeType: 'application/json' },
    ] }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, durationMs: 86_400_001 } }))).toThrow();
    expect(() => createTechnicalVideoManifest(draft({ clock: { ...draft().clock!, status: 'measured', driftToleranceMs: 2401 } }))).toThrow();
  });

  it('rejects sparse or decorated arrays that cannot round-trip canonically', () => {
    const sparse = Array(2) as unknown as TechnicalVideoManifestDraft['assets'];
    (sparse as TechnicalVideoManifestDraft['assets'] & { 0: unknown })[0] = draft().assets[0];
    expect(() => createTechnicalVideoManifest(draft({ assets: sparse }))).toThrow();
    const decorated = [...draft().assets] as TechnicalVideoManifestDraft['assets'] & { extra?: boolean };
    decorated.extra = true;
    expect(() => createTechnicalVideoManifest(draft({ assets: decorated }))).toThrow();
  });

  it('blocks single-clock projection without clock data or verified hashes', () => {
    expect(technicalVideoManifestCanDriveSingleClock(createTechnicalVideoManifest(draft({ clock: null })))).toBe(false);
    expect(technicalVideoManifestCanDriveSingleClock(createTechnicalVideoManifest(draft({ technicalStatus: 'received_unverified' })))).toBe(false);
  });

  it('validates append-only superseding histories even when input order differs', () => {
    const first = createTechnicalVideoManifest(draft());
    const second = createTechnicalVideoManifest(draft({
      manifestId: 'handoff-v2', manifestVersion: 2, supersedesManifestId: first.manifestId, createdAt: '2026-08-14T12:05:00.000Z',
    }));
    expect(technicalVideoManifestHistoryIsValid([second, first])).toBe(true);
  });

  it('rejects history gaps, foreign supersedes, duplicate IDs and time reversal', () => {
    const first = createTechnicalVideoManifest(draft());
    const version = (manifestId: string, manifestVersion: number, supersedesManifestId: string, createdAt = '2026-08-14T12:05:00.000Z') => createTechnicalVideoManifest(draft({ manifestId, manifestVersion, supersedesManifestId, createdAt }));
    expect(technicalVideoManifestHistoryIsValid([first, version('handoff-v3', 3, first.manifestId)])).toBe(false);
    expect(technicalVideoManifestHistoryIsValid([first, version('handoff-v2', 2, 'foreign')])).toBe(false);
    expect(technicalVideoManifestHistoryIsValid([first, first])).toBe(false);
    expect(technicalVideoManifestHistoryIsValid([first, version('handoff-v2', 2, first.manifestId, '2026-08-14T11:59:00.000Z')])).toBe(false);
  });
});
