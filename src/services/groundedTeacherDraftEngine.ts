import type { PoseLandmark } from './realMediaPipePose';
import type { FrameEntry } from './frameInterpolator';
import {
  isMeasurableVaganovaMeasurement,
  type VaganovaFullAnalysis,
} from './vaganovaAngleCalculator';
import type { PosePacket } from '../types/posePacket';
import type { TeacherOverlayPacket } from '../types/teacherHeuristic';
import type { TeacherHeuristicState } from '../types/teacherHeuristic';
import type { GroundedMetricAdapterId, SkeletonTargetFocusId } from '../types/skeletonTarget';
import type {
  GroundedTeacherDraftSections,
  GroundedTeacherGuide,
  GroundedGuideFrameContext,
  GroundedTeacherDraft,
  GroundedTeacherDraftBlockReason,
  GroundedTeacherEvidence,
} from '../types/groundedTeacherDraft';

const MEDIA_TIME_TOLERANCE_US = 1;
export const MAX_TORSO_SNAP_DISTANCE_MS = 16.667;
const VALID_HEURISTIC_STATES = new Set([
  'heuristic_match',
  'heuristic_attention',
  'heuristic_strong_attention',
] as const);

function isGroundedHeuristicState(
  value: unknown,
): value is Exclude<TeacherHeuristicState, 'blocked'> {
  return VALID_HEURISTIC_STATES.has(value as never);
}

const BLOCK_MESSAGES: Readonly<Record<GroundedTeacherDraftBlockReason, string>> = Object.freeze({
  target_not_selected: 'Wähle eine unterstützte Körperlinie aus, um den Lehrerentwurf zu öffnen.',
  video_playing: 'Pausiere das Video auf einem exakt analysierten Frame.',
  exact_cache_frame_missing: 'Für diesen Zeitpunkt liegt kein exakter Analyseframe vor.',
  pose_packet_missing: 'Für diesen Frame liegt keine Pose-Evidenz vor.',
  pose_packet_not_exact_cache: 'Der aktuelle Frame ist noch nicht als exakter Cache-Frame bestätigt.',
  pose_packet_stale: 'Pose und Videozeit stimmen nicht sicher überein.',
  pose_geometry_mismatch: 'Die gezeichnete Pose stimmt nicht mit dem exakten Cache-Frame überein.',
  analysis_missing: 'Für diesen Frame liegt keine autorisierte Linienmessung vor.',
  analysis_stale: 'Messung und gezeichneter Frame stimmen nicht sicher überein.',
  measurement_not_authorized: 'Die ausgewählte Linienbeobachtung ist für diesen Frame nicht auswertbar.',
  overlay_missing: 'Die Lehrer-Ampel hat für diesen Frame noch keine stabile Evidenz.',
  overlay_stale: 'Ampel und gezeichneter Frame stimmen nicht sicher überein.',
  overlay_blocked: 'Die Evidenz reicht für eine farbige Linienbeobachtung nicht aus.',
});

export function createBlockedGroundedTeacherDraft(
  reason: GroundedTeacherDraftBlockReason,
  target: SkeletonTargetFocusId | 'none' = 'none',
): GroundedTeacherDraft {
  return {
    kind: 'blocked',
    target,
    reason,
    message: BLOCK_MESSAGES[reason],
  };
}

export interface GroundedTeacherDraftInput {
  metricAdapter: GroundedMetricAdapterId | null;
  targetJointId: string;
  isPaused: boolean;
  exactCacheLandmarks: readonly PoseLandmark[] | null;
  posePacket: PosePacket | null;
  analysis: VaganovaFullAnalysis | null;
  analysisMediaTimeUs: number | null;
  overlayPacket: TeacherOverlayPacket | null;
  runtime: GroundedGuideFrameContext;
}

type SupportedGroundedTarget = Extract<
  SkeletonTargetFocusId,
  'spine_center' | 'shoulder_line' | 'pelvis_core'
>;

interface GroundedMetricProfile {
  metricId: GroundedMetricAdapterId;
  target: SupportedGroundedTarget;
  measurement: VaganovaFullAnalysis['spineTilt'] | undefined;
  overlayState: TeacherHeuristicState | undefined;
  guide: Readonly<Pick<GroundedTeacherGuide, 'kind' | 'anchor' | 'label'>>;
}

function resolveMetricProfile(input: GroundedTeacherDraftInput): GroundedMetricProfile | null {
  switch (input.metricAdapter) {
    case 'spine_tilt_aplomb':
      return {
        metricId: input.metricAdapter,
        target: 'spine_center',
        measurement: input.analysis?.spineTilt,
        overlayState: input.overlayPacket?.spine,
        guide: {
          kind: 'image_vertical',
          anchor: 'pelvis_center',
          label: 'Aplomb-Orientierung (2D) · Nicole prüft',
        },
      };
    case 'shoulder_horizontal':
      return {
        metricId: input.metricAdapter,
        target: 'shoulder_line',
        measurement: input.analysis?.shoulderSymmetry,
        overlayState: input.overlayPacket?.shoulder,
        guide: {
          kind: 'image_horizontal',
          anchor: 'shoulder_center',
          label: 'Schulter-Orientierung (2D) · Nicole prüft',
        },
      };
    case 'projected_hip_line_obliquity':
      return {
        metricId: input.metricAdapter,
        target: 'pelvis_core',
        measurement: input.analysis?.pelvicTilt,
        overlayState: input.overlayPacket?.pelvis,
        guide: {
          kind: 'image_horizontal',
          anchor: 'pelvis_center',
          label: 'Becken-Orientierung (2D) · Nicole prüft',
        },
      };
    default:
      return null;
  }
}

/**
 * Returns a real pose entry near an arbitrary click time without weakening the
 * exact-frame contract. The caller seeks to this entry before building a draft.
 */
export function findNearestExactPoseFrame(
  frames: readonly FrameEntry[],
  mediaTimeSeconds: number,
  maxDistanceMs: number = MAX_TORSO_SNAP_DISTANCE_MS,
): FrameEntry | null {
  if (
    !Number.isFinite(mediaTimeSeconds)
    || mediaTimeSeconds < 0
    || !Number.isFinite(maxDistanceMs)
    || maxDistanceMs < 0
  ) return null;

  const targetMs = mediaTimeSeconds * 1000;
  let nearest: FrameEntry | null = null;
  let nearestDistance = Infinity;
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) continue;
    const distance = Math.abs(frame.timeMs - targetMs);
    if (distance < nearestDistance || (
      distance === nearestDistance
      && nearest !== null
      && frame.timeMs < nearest.timeMs
    )) {
      nearest = frame;
      nearestDistance = distance;
    }
  }

  return nearest
    && nearestDistance <= maxDistanceMs
    && nearest.resultKind !== 'no_pose'
    && nearest.landmarks !== null
    && nearest.landmarks.length >= 33
    ? nearest
    : null;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 1;
}

function mediaTimeMatches(left: number, right: number): boolean {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= MEDIA_TIME_TOLERANCE_US;
}

function landmarksMatchExactCache(
  packetLandmarks: readonly PoseLandmark[],
  cacheLandmarks: readonly PoseLandmark[],
): boolean {
  if (packetLandmarks.length !== cacheLandmarks.length || packetLandmarks.length < 33) return false;

  return packetLandmarks.every((packetPoint, index) => {
    const cachePoint = cacheLandmarks[index];
    return cachePoint !== undefined
      && packetPoint.x === cachePoint.x
      && packetPoint.y === cachePoint.y
      && packetPoint.z === cachePoint.z
      && packetPoint.visibility === cachePoint.visibility;
  });
}

function overlayIsCurrent(
  overlay: TeacherOverlayPacket,
  runtime: GroundedGuideFrameContext,
): boolean {
  return overlay.streamEpoch === runtime.streamEpoch
    && overlay.policyVersion === runtime.policyVersion
    && mediaTimeMatches(overlay.framePtsSeconds * 1_000_000, runtime.mediaTimeUs);
}

function createEvidence(
  input: GroundedTeacherDraftInput,
  profile: GroundedMetricProfile,
): GroundedTeacherEvidence | null {
  const measurement = profile.measurement;
  const packet = input.posePacket;
  const overlay = input.overlayPacket;
  const runtime = input.runtime;

  if (!packet || !overlay || !isMeasurableVaganovaMeasurement(measurement)) return null;
  if (!isGroundedHeuristicState(profile.overlayState)) return null;

  return Object.freeze({
    metricId: profile.metricId,
    valueDeg: Math.abs(measurement.value),
    confidence: measurement.confidence,
    measurementClass: 'vaganova_relation',
    heuristicState: profile.overlayState,
    sourceId: runtime.sourceId,
    streamEpoch: runtime.streamEpoch,
    generation: runtime.generation,
    mediaTimeUs: runtime.mediaTimeUs,
    videoWidth: runtime.videoWidth,
    videoHeight: runtime.videoHeight,
    policyVersion: runtime.policyVersion,
    source: 'exact_frame_cache',
  });
}

function runtimeIdentityIsValid(runtime: GroundedGuideFrameContext): boolean {
  return runtime.sourceId.trim().length > 0
    && runtime.policyVersion.trim().length > 0
    && Number.isFinite(runtime.streamEpoch)
    && Number.isFinite(runtime.generation)
    && Number.isFinite(runtime.mediaTimeUs)
    && runtime.mediaTimeUs >= 0
    && finitePositive(runtime.videoWidth)
    && finitePositive(runtime.videoHeight);
}

function buildSections(
  evidence: GroundedTeacherEvidence,
): GroundedTeacherDraftSections {
  const value = evidence.valueDeg.toFixed(1);
  const pts = (evidence.mediaTimeUs / 1_000_000).toFixed(3);
  const visibility = Math.round(evidence.confidence * 100);
  const technical = `${evidence.metricId} · ${value}° · Frame ${pts}s · exakter Cache-Frame · Landmark-Sichtbarkeit ${visibility}% · ${evidence.measurementClass}.`;

  switch (evidence.metricId) {
    case 'shoulder_horizontal':
      return Object.freeze({
        what: `In diesem Bild weicht die projizierte Schulterlinie um ${value}° von der Bildhorizontalen ab. Das ist eine sichtbare 2D-Beobachtung am pausierten Frame.`,
        whyConditional: 'Falls Nicole in dieser Phase eine ruhige oder horizontale Schulterlinie erwartet, verändert die sichtbare Höhendifferenz die Organisation des Oberkörpers. Ein beabsichtigtes Épaulement kann die Linie dagegen bewusst verändern; die Ursache lässt sich aus diesem Frame allein nicht bestimmen.',
        goalConditional: 'Orientierung für Nicoles Prüfung: Beide sichtbaren Schulterpunkte näher an der Bildhorizontalen organisieren – sofern Bewegungsphase, Blickrichtung und Épaulement keine bewusste Abweichung verlangen.',
        practiceForTeacherReview: 'Video an diesem Frame pausieren, Schulterlinie und Kopf-/Rumpfausrichtung gemeinsam ansehen und die Bewegung langsam bis zu diesem Moment wiederholen. Nicole entscheidet, ob Halten, Lösen oder eine konkrete Port-de-Bras-Korrektur geübt wird.',
        metaphor: '„Trag auf deinen Schultern ein breites, ruhiges Tablett: Es bleibt offen und getragen – außer Nicole kippt es bewusst für das Épaulement.“',
        technical,
        limitations: 'Die Linie zeigt nur die 2D-Bildprojektion. Perspektive, Körperrotation und beabsichtigtes Épaulement können eine sichtbare Neigung erzeugen. Muskelspannung, Kraft oder Ursache sind aus diesem Frame nicht bestimmbar.',
        sourceRefs: Object.freeze([
          'BalletOS Messvertrag: shoulder_horizontal / Bildprojektion',
          'Pädagogische Schulter-Orientierung: KI-Entwurf, Nicoles Prüfung ausstehend',
        ]),
      });
    case 'projected_hip_line_obliquity':
      return Object.freeze({
        what: `In diesem Bild weicht die projizierte Beckenlinie um ${value}° von der Bildhorizontalen ab. Das ist eine sichtbare 2D-Beobachtung am pausierten Frame.`,
        whyConditional: 'Falls Nicole in dieser Phase ein waagerecht organisiertes Becken erwartet, verändert die sichtbare Höhendifferenz die darüber gestapelten Körperlinien. Arbeitsbein, Gewichtsverlagerung, Perspektive oder Phase können die Linie jedoch bewusst verändern; die Ursache ist aus diesem Frame nicht ableitbar.',
        goalConditional: 'Orientierung für Nicoles Prüfung: Beide sichtbaren Hüftpunkte näher an der Bildhorizontalen organisieren – nur wenn Position und Bewegungsphase ein neutrales Becken verlangen.',
        practiceForTeacherReview: 'Frame pausieren, Beckenlinie zusammen mit Standbein und Rumpfachse vergleichen und die Passage langsam wiederholen. Nicole legt danach den konkreten Korrekturhinweis und die passende Übung fest.',
        metaphor: '„Stell dir das Becken als ruhige Schale vor: Nicole entscheidet, ob sie in diesem Moment waagerecht getragen oder für die Bewegung bewusst geneigt wird.“',
        technical,
        limitations: 'Die Verbindung der sichtbaren Hüftpunkte ist eine frontale 2D-Projektion, kein anatomischer 3D-Beckenwinkel. Kameraperspektive, Rotation und Belastungsphase müssen von Nicole geprüft werden; Muskel- oder Kraftursachen sind nicht messbar.',
        sourceRefs: Object.freeze([
          'BalletOS Messvertrag: projected_hip_line_obliquity / Bildprojektion',
          'Pädagogische Becken-Orientierung: KI-Entwurf, Nicoles Prüfung ausstehend',
        ]),
      });
    case 'spine_tilt_aplomb':
      return Object.freeze({
        what: `In diesem Bild ist die projizierte Rumpfachse um ${value}° gegenüber der Bildvertikalen geneigt. Das ist eine sichtbare 2D-Beobachtung am pausierten Frame.`,
        whyConditional: 'Falls Nicole in dieser Phase Aplomb erwartet, verändert eine geneigte Rumpfachse die sichtbare Stapelung von Schultergürtel und Becken. Aus diesem Frame allein lässt sich die Ursache nicht bestimmen.',
        goalConditional: 'Orientierung für Nicoles Prüfung: Schultermitte und Beckenmitte näher über derselben Bildlotlinie organisieren – ohne ein beabsichtigtes Épaulement oder die konkrete Phase zu überschreiben.',
        practiceForTeacherReview: 'Video am markierten Punkt pausieren, die Linie im Spiegel oder in einer Wiederholung vergleichen und die Bewegung langsam bis zu diesem Moment führen. Wiederholungen und Korrekturhinweis legt Nicole fest.',
        metaphor: '„Stell dir einen goldenen Faden am Scheitel vor: Die Körperblöcke ordnen sich darunter wie ruhig gestapelte Bausteine – lang, aber nicht starr.“',
        technical,
        limitations: 'Die Linie zeigt eine Bildprojektion, keine 3D-Körperachse. Nicole prüft: Ist die Neigung beabsichtigt? Passt Bewegungsphase und Kameraperspektive? Liegt eine Gewichtsverlagerung vor? Muskelursachen sind aus diesem Video nicht bestimmbar.',
        sourceRefs: Object.freeze([
          'BalletOS Messvertrag: spine_tilt_aplomb / Bildprojektion',
          'Pädagogische Aplomb-Orientierung: KI-Entwurf, Nicoles Prüfung ausstehend',
        ]),
      });
  }
}

export function buildGroundedTeacherDraft(
  input: GroundedTeacherDraftInput,
): GroundedTeacherDraft {
  const runtime = input.runtime;
  const packet = input.posePacket;
  const profile = resolveMetricProfile(input);
  const measurement = profile?.measurement;

  if (!profile || input.targetJointId !== profile.target) {
    return createBlockedGroundedTeacherDraft('target_not_selected');
  }
  const target = profile.target;
  if (!input.isPaused) return createBlockedGroundedTeacherDraft('video_playing', target);
  if (!runtimeIdentityIsValid(runtime)) {
    return createBlockedGroundedTeacherDraft('pose_packet_stale', target);
  }
  if (!input.exactCacheLandmarks) {
    return createBlockedGroundedTeacherDraft('exact_cache_frame_missing', target);
  }
  if (!packet || packet.resultKind !== 'pose') {
    return createBlockedGroundedTeacherDraft('pose_packet_missing', target);
  }
  if (packet.source !== 'frame_cache') {
    return createBlockedGroundedTeacherDraft('pose_packet_not_exact_cache', target);
  }
  if (
    packet.sourceId !== runtime.sourceId
    || packet.streamEpoch !== runtime.streamEpoch
    || packet.generation !== runtime.generation
    || !mediaTimeMatches(packet.mediaTimeUs, runtime.mediaTimeUs)
    || packet.videoWidth !== runtime.videoWidth
    || packet.videoHeight !== runtime.videoHeight
  ) {
    return createBlockedGroundedTeacherDraft('pose_packet_stale', target);
  }
  if (!landmarksMatchExactCache(packet.landmarks, input.exactCacheLandmarks)) {
    return createBlockedGroundedTeacherDraft('pose_geometry_mismatch', target);
  }
  if (!input.analysis) return createBlockedGroundedTeacherDraft('analysis_missing', target);
  if (
    input.analysisMediaTimeUs === null
    || !mediaTimeMatches(input.analysisMediaTimeUs, runtime.mediaTimeUs)
  ) {
    return createBlockedGroundedTeacherDraft('analysis_stale', target);
  }
  if (
    !isMeasurableVaganovaMeasurement(measurement)
    || measurement.measurement_class !== 'vaganova_relation'
    || measurement.unit !== 'deg'
    || !Number.isFinite(measurement.value)
    || !Number.isFinite(measurement.confidence)
    || measurement.confidence < 0
    || measurement.confidence > 1
  ) {
    return createBlockedGroundedTeacherDraft('measurement_not_authorized', target);
  }
  if (!input.overlayPacket) return createBlockedGroundedTeacherDraft('overlay_missing', target);
  if (!overlayIsCurrent(input.overlayPacket, runtime)) {
    return createBlockedGroundedTeacherDraft('overlay_stale', target);
  }
  if (!isGroundedHeuristicState(profile.overlayState)) {
    return createBlockedGroundedTeacherDraft('overlay_blocked', target);
  }

  const evidence = createEvidence(input, profile);
  if (!evidence) return createBlockedGroundedTeacherDraft('measurement_not_authorized', target);

  const guide: GroundedTeacherGuide = Object.freeze({
    ...profile.guide,
    reviewState: 'pending_nicole',
    evidence,
  });

  return Object.freeze({
    kind: 'ready',
    target,
    reviewState: 'pending_nicole',
    learnerVisible: false,
    parentVisible: false,
    evidence,
    sections: buildSections(evidence),
    guide,
  });
}

function guideShapeMatchesMetric(guide: GroundedTeacherGuide): boolean {
  switch (guide.evidence.metricId) {
    case 'spine_tilt_aplomb':
      return guide.kind === 'image_vertical'
        && guide.anchor === 'pelvis_center'
        && guide.label === 'Aplomb-Orientierung (2D) · Nicole prüft';
    case 'shoulder_horizontal':
      return guide.kind === 'image_horizontal'
        && guide.anchor === 'shoulder_center'
        && guide.label === 'Schulter-Orientierung (2D) · Nicole prüft';
    case 'projected_hip_line_obliquity':
      return guide.kind === 'image_horizontal'
        && guide.anchor === 'pelvis_center'
        && guide.label === 'Becken-Orientierung (2D) · Nicole prüft';
    default:
      return false;
  }
}

export function isGroundedTeacherGuideCurrent(
  guide: GroundedTeacherGuide | undefined,
  context: GroundedGuideFrameContext | undefined,
): guide is GroundedTeacherGuide {
  if (!guide || !context) return false;
  const evidence = guide.evidence;

  return guideShapeMatchesMetric(guide)
    && guide.reviewState === 'pending_nicole'
    && evidence.measurementClass === 'vaganova_relation'
    && isGroundedHeuristicState(evidence.heuristicState)
    && evidence.source === 'exact_frame_cache'
    && evidence.sourceId.length > 0
    && evidence.policyVersion.length > 0
    && Number.isFinite(evidence.valueDeg)
    && Number.isFinite(evidence.confidence)
    && evidence.confidence >= 0
    && evidence.confidence <= 1
    && finitePositive(evidence.videoWidth)
    && finitePositive(evidence.videoHeight)
    && evidence.sourceId === context.sourceId
    && evidence.streamEpoch === context.streamEpoch
    && evidence.generation === context.generation
    && evidence.videoWidth === context.videoWidth
    && evidence.videoHeight === context.videoHeight
    && evidence.policyVersion === context.policyVersion
    && mediaTimeMatches(evidence.mediaTimeUs, context.mediaTimeUs);
}

/** Backwards-compatible name for existing renderer/test imports. */
export const isGroundedAplombGuideCurrent = isGroundedTeacherGuideCurrent;

export function groundedTeacherDraftFingerprint(draft: GroundedTeacherDraft): string {
  if (draft.kind === 'blocked') return `blocked:${draft.target}:${draft.reason}`;
  const e = draft.evidence;
  return [
    'ready', draft.target, e.metricId, e.sourceId, e.streamEpoch, e.generation, e.mediaTimeUs,
    e.videoWidth, e.videoHeight, e.policyVersion, e.valueDeg, e.confidence,
    e.heuristicState,
  ].join(':');
}
