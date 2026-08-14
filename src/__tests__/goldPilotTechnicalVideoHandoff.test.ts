import { describe, expect, it } from 'vitest';
import {
  GOLD_PILOT_ADAPTER_SHA256,
  GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS,
  goldPilotVideosMayDriveProductPlayback,
  goldPilotVideosMayShipInProduct,
} from '../services/goldPilotTechnicalVideoHandoff';
import {
  technicalVideoManifestHistoryIsValid,
  technicalVideoManifestIsValid,
  technicalVideoManifestIsProductUsable,
} from '../services/technicalVideoManifest';
import { getMotionReferenceLibraryEntry } from '../services/motionReferenceLibrary';

describe('immutable Gold pilot technical-video handoff', () => {
  it('binds the independently verified handoff hashes, sizes, frames and clocks', () => {
    expect(GOLD_PILOT_ADAPTER_SHA256).toBe('8ba69b740d71d1ce956b85caa7bb08830a23897d78143b6afaab1dd35b290d3a');
    expect(GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS).toHaveLength(2);
    expect(GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.every(technicalVideoManifestIsValid)).toBe(true);
    expect(technicalVideoManifestHistoryIsValid(GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS)).toBe(true);

    const long = GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.find(item => item.clock?.durationMs === 12_000)!;
    const short = GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.find(item => item.clock?.durationMs === 3_760)!;
    expect(long.assets.find(asset => asset.role === 'technical_clip')).toMatchObject({
      sha256: '9a68ea8df33b82f21fa7cfc97aa802fe2c8c40a339e1ec6748e0e9f5d53b5a67',
      byteSize: 19_946_214,
    });
    expect(short.assets.find(asset => asset.role === 'technical_clip')).toMatchObject({
      sha256: '0415633ddc6a78f6f73bbcee42cfd2deabe740aa5da44f3aca2fe999aef44e8e',
      byteSize: 3_328_472,
    });
    expect(long.clock).toMatchObject({ frameRateHz: 25, durationMs: 12_000, status: 'measured' });
    expect(short.clock).toMatchObject({ frameRateHz: 25, durationMs: 3_760, status: 'measured' });
  });

  it('keeps all product, rights, subject-matter and Nicole gates fail-closed', () => {
    for (const manifest of GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS) {
      expect(manifest.rights).toEqual({
        rightsBasis: 'unknown',
        licenseStatus: 'unknown',
        productUseStatus: 'not_assessed',
        releaseStatus: 'not_granted',
        rightsEvidenceStatus: 'missing',
      });
      expect(manifest.subjectMatterStatus).toBe('unreviewed');
      expect(manifest.nicoleReferenceStatus).toBe('not_claimed');
      expect(manifest.motionContext).toMatchObject({
        classificationStatus: 'source_declared', exerciseId: 'plie', phaseId: null, view: null, workingSide: null,
      });
      expect(technicalVideoManifestIsProductUsable(manifest)).toBe(false);
      expect(JSON.stringify(manifest)).not.toContain('/Volumes/');
    }
    expect(goldPilotVideosMayShipInProduct()).toBe(false);
    expect(goldPilotVideosMayDriveProductPlayback()).toBe(false);
    expect(getMotionReferenceLibraryEntry('gold-pilot-plie-video-20260814')?.technicalManifestIds).toEqual(
      GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.map(manifest => manifest.manifestId),
    );
  });
});
