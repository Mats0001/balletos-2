export type ReferenceRightsBasis =
  | 'cc0'
  | 'cc_by_4_0'
  | 'official_public_permission_statement'
  | 'contract_restricted'
  | 'unknown';

export type ReferenceProductStatus =
  | 'technical_runtime_allowed'
  | 'internal_pilot_only'
  | 'license_required'
  | 'not_cleared';

export interface MotionReferenceLibraryEntry {
  id: string;
  label: string;
  sourceUrl: string;
  sourceKind: 'optical_marker' | 'bvh_skeleton' | 'mocap_skeleton' | 'authored_animation' | 'technical_video_handoff';
  exerciseId?: 'plie' | 'tendu' | 'passe' | 'jete' | 'changement';
  technicalManifestIds?: readonly string[];
  rightsBasis: ReferenceRightsBasis;
  rightsLabel: string;
  technicalUse: readonly string[];
  nicoleReviewStatus: 'not_reviewed' | 'nicole_approved';
  pedagogicalStatus: 'technical_only' | 'nicole_reference';
  productStatus: ReferenceProductStatus;
  attribution?: string;
}

/** Dataset availability, rights and pedagogical authority stay independent. */
export const MOTION_REFERENCE_LIBRARY: readonly MotionReferenceLibraryEntry[] = Object.freeze([
  Object.freeze({
    id: 'gold-pilot-plie-video-20260814',
    label: 'Gold-Pilot Video · Plié · technische Sichtung',
    sourceUrl: 'local-handoff-record',
    sourceKind: 'technical_video_handoff',
    exerciseId: 'plie',
    technicalManifestIds: Object.freeze(GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS.map(manifest => manifest.manifestId)),
    rightsBasis: 'unknown',
    rightsLabel: 'Rechte und Release nicht geprüft · nicht im Produkt gebündelt',
    technicalUse: Object.freeze(['Split-Screen-Prüfkandidat', 'Ganzkörper-Framing prüfen', '25-fps-Clock prüfen']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'not_cleared',
  }),
  Object.freeze({
    id: 'dryad-tendu-2025',
    label: 'Dryad · Tendu timing & foot path',
    sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
    sourceKind: 'optical_marker',
    rightsBasis: 'cc0',
    rightsLabel: 'CC0-1.0',
    technicalUse: Object.freeze(['Tendu-Fußbahn', 'fünf Phasen', 'Zeitstruktur', 'Regression']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'technical_runtime_allowed',
  }),
  Object.freeze({
    id: 'dryad-passe-2025',
    label: 'Dryad · Passé event timing & foot path',
    sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
    sourceKind: 'optical_marker',
    rightsBasis: 'cc0',
    rightsLabel: 'CC0-1.0',
    technicalUse: Object.freeze(['Passé-Ereignisse', 'Fußhöchstpunkt', 'Zeitstruktur', 'Regression']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'technical_runtime_allowed',
  }),
  Object.freeze({
    id: 'dryad-jete-2025',
    label: 'Dryad · Jeté outward timing & foot path',
    sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
    sourceKind: 'optical_marker',
    rightsBasis: 'cc0',
    rightsLabel: 'CC0-1.0',
    technicalUse: Object.freeze(['Jeté-Fußbahn', 'Auswärts-/Rückkehrereignisse', 'Zeitstruktur', 'Regression']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'technical_runtime_allowed',
  }),
  Object.freeze({
    id: 'dryad-changement-2025',
    label: 'Dryad · Changement jump timing',
    sourceUrl: 'https://doi.org/10.5061/dryad.dncjsxm8v',
    sourceKind: 'optical_marker',
    rightsBasis: 'cc0',
    rightsLabel: 'CC0-1.0',
    technicalUse: Object.freeze(['Sprungereignisse', 'C7-Höhenverlauf', 'Bodenkraft-Timing', 'Regression']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'technical_runtime_allowed',
  }),
  Object.freeze({
    id: 'ucy-ballet-bvh',
    label: 'UCY DanceDB · full-body carrier',
    sourceUrl: 'https://dancedb.cs.ucy.ac.cy/main/performances',
    sourceKind: 'bvh_skeleton',
    rightsBasis: 'contract_restricted',
    rightsLabel: 'Persönlicher Einplatz-Forschungspilot',
    technicalUse: Object.freeze(['internes Retargeting', 'räumliche Stabilisierung']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'internal_pilot_only',
  }),
  Object.freeze({
    id: 'cmu-mocap-pilot',
    label: 'CMU Motion Capture · regression pilot',
    sourceUrl: 'https://mocap.cs.cmu.edu/',
    sourceKind: 'mocap_skeleton',
    rightsBasis: 'official_public_permission_statement',
    rightsLabel: 'Offizielle öffentliche Nutzungserlaubnis; Rohdaten nicht weiterverkaufen',
    technicalUse: Object.freeze(['Importtests', 'Retargeting', 'Zeitreihen', 'Regression']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'technical_runtime_allowed',
    attribution: 'Carnegie Mellon University Motion Capture Database',
  }),
  Object.freeze({
    id: 'balletmoves-ii',
    label: 'BalletMoves II · internal taxonomy pilot',
    sourceUrl: 'local-license-record',
    sourceKind: 'authored_animation',
    rightsBasis: 'contract_restricted',
    rightsLabel: 'Credo Content License · ein kontrollierter Rechner',
    technicalUse: Object.freeze(['interne Taxonomie', 'Bewegungslexikon', 'Phasenmarker']),
    nicoleReviewStatus: 'not_reviewed',
    pedagogicalStatus: 'technical_only',
    productStatus: 'license_required',
  }),
]);

export function getMotionReferenceLibraryEntry(id: string): MotionReferenceLibraryEntry | null {
  return MOTION_REFERENCE_LIBRARY.find(entry => entry.id === id) ?? null;
}
import { GOLD_PILOT_TECHNICAL_VIDEO_MANIFESTS } from './goldPilotTechnicalVideoHandoff';
