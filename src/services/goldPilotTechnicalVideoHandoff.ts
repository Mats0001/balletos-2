import {
  createTechnicalVideoManifest,
  technicalVideoManifestCanDriveSingleClock,
  technicalVideoManifestIsProductUsable,
} from './technicalVideoManifest';
import type { TechnicalVideoManifest } from '../types/technicalVideoManifest';

export const GOLD_PILOT_HANDOFF_ID = 'gold-pilot-20260814t145500z' as const;
export const GOLD_PILOT_ADAPTER_SHA256 = '8ba69b740d71d1ce956b85caa7bb08830a23897d78143b6afaab1dd35b290d3a' as const;

type GoldPilotClip = Readonly<{
  candidateId: string;
  sha256: string;
  byteSize: number;
  durationMs: number;
  thumbnailSha256: string;
  thumbnailByteSize: number;
  contactSheetSha256: string;
  contactSheetByteSize: number;
}>;

const HANDOFF_CREATED_AT = '2026-08-14T14:55:00.000Z';

const CLIPS: readonly GoldPilotClip[] = Object.freeze([
  Object.freeze({
    candidateId: 'cf6ec138f17b17197c97',
    sha256: '9a68ea8df33b82f21fa7cfc97aa802fe2c8c40a339e1ec6748e0e9f5d53b5a67',
    byteSize: 19_946_214,
    durationMs: 12_000,
    thumbnailSha256: '883d38ce61817fc4e67c4a10f7bd52fca010a148241b748ba7a45d72163fe55e',
    thumbnailByteSize: 36_909,
    contactSheetSha256: '1d5ba80be384aa25a0b58f54afa90dab2944e795ed8694056909b34cc468a377',
    contactSheetByteSize: 97_481,
  }),
  Object.freeze({
    candidateId: '29e857176546fdfef9f0',
    sha256: '0415633ddc6a78f6f73bbcee42cfd2deabe740aa5da44f3aca2fe999aef44e8e',
    byteSize: 3_328_472,
    durationMs: 3_760,
    thumbnailSha256: 'd26e559a48e664dfdebe6b9b7b0b15cf64ab8c1dffcbf8ac726be7711c4860ff',
    thumbnailByteSize: 31_067,
    contactSheetSha256: '06c95a4d7824a1f14e723d41fc5b496d4985f294bb2dfea23e43608b06a2e356',
    contactSheetByteSize: 83_177,
  }),
]);

function createManifest(clip: GoldPilotClip): TechnicalVideoManifest {
  const clipAssetId = `clip-${clip.candidateId}`;
  return createTechnicalVideoManifest({
    manifestId: `${GOLD_PILOT_HANDOFF_ID}-${clip.candidateId}`,
    handoffId: `${GOLD_PILOT_HANDOFF_ID}-${clip.candidateId}`,
    manifestVersion: 1,
    supersedesManifestId: null,
    createdAt: HANDOFF_CREATED_AT,
    sourceKind: 'professional_video_handoff',
    displayLabel: `Gold-Pilot · technischer Plié-Clip · ${(clip.durationMs / 1000).toFixed(2)} s`,
    assets: [
      {
        assetId: clipAssetId,
        role: 'technical_clip',
        fileName: `${clip.candidateId}.mp4`,
        relativePath: `clips/${clip.candidateId}.mp4`,
        sha256: clip.sha256,
        byteSize: clip.byteSize,
        mimeType: 'video/mp4',
        derivedFromAssetIds: [],
      },
      {
        assetId: `thumbnail-${clip.candidateId}`,
        role: 'thumbnail',
        fileName: `${clip.candidateId}_thumbnail.jpg`,
        relativePath: `evidence/${clip.candidateId}_thumbnail.jpg`,
        sha256: clip.thumbnailSha256,
        byteSize: clip.thumbnailByteSize,
        mimeType: 'image/jpeg',
        derivedFromAssetIds: [clipAssetId],
      },
      {
        assetId: `contact-sheet-${clip.candidateId}`,
        role: 'contact_sheet',
        fileName: `${clip.candidateId}_contact_sheet.jpg`,
        relativePath: `evidence/${clip.candidateId}_contact_sheet.jpg`,
        sha256: clip.contactSheetSha256,
        byteSize: clip.contactSheetByteSize,
        mimeType: 'image/jpeg',
        derivedFromAssetIds: [clipAssetId],
      },
    ],
    rights: {
      rightsBasis: 'unknown',
      licenseStatus: 'unknown',
      productUseStatus: 'not_assessed',
      releaseStatus: 'not_granted',
      rightsEvidenceStatus: 'missing',
    },
    technicalStatus: 'hash_verified',
    subjectMatterStatus: 'unreviewed',
    nicoleReferenceStatus: 'not_claimed',
    motionContext: {
      classificationStatus: 'source_declared',
      exerciseId: 'plie',
      phaseId: null,
      view: null,
      workingSide: null,
    },
    clock: {
      assetId: clipAssetId,
      status: 'measured',
      frameRateHz: 25,
      durationMs: clip.durationMs,
      mediaTimeOrigin: 'container_pts',
      driftToleranceMs: 0,
    },
  });
}

/**
 * Sanitized metadata projection of the immutable Vault handoff. The media stay
 * outside the product bundle until rights, license and release are verified.
 */
export const GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS: readonly TechnicalVideoManifest[] = Object.freeze(
  CLIPS.map(createManifest),
);

export function goldPilotVideosMayShipInProduct(): boolean {
  return GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.every(technicalVideoManifestIsProductUsable);
}

/** A measured clock is metadata only; product playback additionally requires every rights/release gate. */
export function goldPilotVideosMayDriveProductPlayback(): boolean {
  return GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.every(manifest => (
    technicalVideoManifestIsProductUsable(manifest)
    && technicalVideoManifestCanDriveSingleClock(manifest)
  ));
}
