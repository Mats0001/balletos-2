import { describe, expect, it } from 'vitest';
import {
  isTeacherOverlayPacketCurrent,
  isSelectedSkeletonTargetCurrent,
  renderSkeletonToCanvas,
  resolveSelectedSkeletonTargetFocus,
  resolveTeacherGlowType,
  resolveTeacherOverlayStyle,
  TeacherOverlayRegionKey,
} from '../services/skeletonCanvasRenderer';
import type { ReconstructedSkeleton } from '../services/vaganova3DKinematics';
import type {
  UnavailableVaganovaMeasurement,
  VaganovaFullAnalysis,
  VaganovaMeasurement,
} from '../services/vaganovaAngleCalculator';
import { createBlockedPacket, TeacherHeuristicState } from '../types/teacherHeuristic';
import { buildGroundedTeacherDraft } from '../services/groundedTeacherDraftEngine';
import type { PoseLandmark } from '../services/realMediaPipePose';
import type { GroundedTeacherGuide } from '../types/groundedTeacherDraft';
import { sha256Canonical } from '../services/cueReviewAudit';
import { NICOLE_REFERENCE_DIGEST_ALGORITHM } from '../types/nicoleReferenceLine';

const REGION_KEYS: TeacherOverlayRegionKey[] = [
  'torsoAlignment', 'spine', 'shoulder', 'pelvis',
  'armL', 'armR', 'legL', 'legR',
  'footL', 'footR', 'cog', 'head',
];

const EXPECTED = {
  heuristic_match: { color: '#30d158', dash: [] },
  heuristic_attention: { color: '#ffd60a', dash: [] },
  heuristic_strong_attention: { color: '#ff453a', dash: [] },
  heuristic_match_uncertain: { color: '#30d158', dash: [0.75, 3.25] },
  heuristic_attention_uncertain: { color: '#ffd60a', dash: [0.75, 3.25] },
  heuristic_strong_attention_uncertain: { color: '#ff453a', dash: [0.75, 3.25] },
  heuristic_review: { color: '#ffd60a', dash: [0.75, 3.25] },
  blocked: { color: '#ffd60a', dash: [0.75, 3.25] },
} satisfies Record<TeacherHeuristicState, { color: string; dash: number[] }>;

interface StrokeRecord {
  color: string;
  alpha: number;
  dash: number[];
  width: number;
}

function createRecordingCanvas(cssWidth = 1000) {
  const strokes: StrokeRecord[] = [];
  const fills: string[] = [];
  let currentDash: number[] = [];
  const context = {
    canvas: { width: 1000, height: 1000, getBoundingClientRect: () => ({ width: cssWidth, height: cssWidth }) },
    strokeStyle: '#000000',
    fillStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    save: () => undefined,
    restore: () => undefined,
    clearRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    fill() {
      fills.push(String(this.fillStyle));
    },
    roundRect: () => undefined,
    fillText: () => undefined,
    measureText: (value: string) => ({ width: value.length * 8 }),
    setLineDash: (dash: number[]) => { currentDash = [...dash]; },
    stroke() {
      strokes.push({
        color: String(this.strokeStyle),
        alpha: this.globalAlpha,
        dash: [...currentDash],
        width: this.lineWidth,
      });
    },
  };
  const canvas = {
    width: 1000,
    height: 1000,
    getBoundingClientRect: () => ({ width: cssWidth, height: cssWidth }),
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return { canvas, strokes, fills };
}

const point = (x: number, y: number) => ({ x, y, vis: 1 });

const SKELETON: ReconstructedSkeleton = {
  head: point(500, 100),
  neck: point(500, 180),
  sternum: point(500, 300),
  navel: point(500, 430),
  pelvisCenter: point(500, 520),
  shoulderL: point(400, 200),
  shoulderR: point(600, 200),
  elbowL: point(320, 300),
  elbowR: point(680, 300),
  wristL: point(250, 380),
  wristR: point(750, 380),
  pelvisL: point(450, 520),
  pelvisR: point(550, 520),
  kneeL: point(450, 700),
  kneeR: point(550, 700),
  ankleL: point(440, 900),
  ankleR: point(560, 900),
  footL: point(400, 930),
  footR: point(600, 930),
};

const rawMeasurement = (
  confidence: number,
  status: 'CORRECT' | 'WARNING' | 'ERROR' = 'ERROR',
): VaganovaMeasurement => ({
  value: 99,
  unit: 'deg',
  confidence,
  label: 'adversarial raw status',
  measurement_class: 'vaganova_relation',
  status,
});

function rawAnalysis(confidence: number): VaganovaFullAnalysis {
  const raw = rawMeasurement(confidence);
  // Deliberately malformed runtime payload: the renderer must still ignore raw
  // knee-axis status in favour of the trusted overlay packet.
  const adversarialKneeAxis = raw as unknown as UnavailableVaganovaMeasurement;
  return {
    knieFlexionL: raw,
    knieFlexionR: raw,
    valgusDriftL: adversarialKneeAxis,
    valgusDriftR: adversarialKneeAxis,
    turnoutL: raw,
    turnoutR: raw,
    spineTilt: raw,
    epaulement: raw,
    portDeBrasL: raw,
    portDeBrasR: raw,
    pelvicTilt: raw,
    shoulderSymmetry: raw,
    shoulderElevationL: raw,
    shoulderElevationR: raw,
    armLineQualityL: raw,
    armLineQualityR: raw,
    headTilt: raw,
    plumbDeviation: raw,
  };
}

function renderTeacherPacket(
  confidence: number,
  frameContext: { streamEpoch: number; framePtsSeconds: number; policyVersion: string } | undefined = {
    streamEpoch: 42,
    framePtsSeconds: 2.5,
    policyVersion: '0.4.0-phase-evidence-separation',
  },
  selectedJointId: string = '',
  glowType?: 'GOOD' | 'CORRECTION',
) {
  const { canvas, strokes } = createRecordingCanvas();
  const packet = createBlockedPacket(2.5, 42);
  for (const key of REGION_KEYS) packet[key] = 'heuristic_match';

  renderSkeletonToCanvas(
    canvas,
    SKELETON,
    { x: 500, y: 520 },
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      showSkeleton: true,
      showMotionTrails: false,
      showCoG: false,
      showAngleArcs: false,
      selectedJointId,
      glowType,
      isPlie: true,
      vaganovaAnalysis: rawAnalysis(confidence),
      overlayMode: 'lehrer-ampel',
      overlayPacket: packet,
      overlayFrameContext: frameContext,
    },
  );

  return strokes;
}

describe('trusted skeleton color contract', () => {
  it('binds exact target focus to the selected joint or bone anchor, never a region proxy', () => {
    const selected = {
      targetId: 'bone.forearm_l' as const,
      kind: 'bone' as const,
      anchorNormalized: { x: 0.27, y: 0.35 },
      sourceId: 'clip-a', streamEpoch: 4, generation: 3, mediaTimeUs: 2_500_000,
      segmentT: 0.6,
      frameStatus: 'exact_cache_frame' as const,
    };
    const context = { sourceId: 'clip-a', streamEpoch: 4, generation: 3, mediaTimeUs: 2_500_000 };

    expect(isSelectedSkeletonTargetCurrent(selected, context)).toBe(true);
    expect(resolveSelectedSkeletonTargetFocus(selected, context, 1000, 800)).toEqual({ x: 270, y: 280 });
    expect(resolveSelectedSkeletonTargetFocus(selected, { ...context, generation: 5 }, 1000, 800)).toBeNull();
  });
  it.each(Object.entries(EXPECTED) as Array<[
    TeacherHeuristicState,
    { color: string; dash: number[] },
  ]>)('maps %s through the packet presentation contract', (state, expected) => {
    const packet = createBlockedPacket(2.5, 42);
    for (const key of REGION_KEYS) packet[key] = state;

    for (const key of REGION_KEYS) {
      expect(resolveTeacherOverlayStyle(packet, key)).toEqual({ state, ...expected });
    }
  });

  it('fails closed for a missing packet', () => {
    for (const key of REGION_KEYS) {
      expect(resolveTeacherOverlayStyle(undefined, key)).toEqual({
        state: 'blocked',
        ...EXPECTED.blocked,
      });
    }
  });

  it('fails closed for a malformed packet state', () => {
    const packet = createBlockedPacket(2.5, 42);
    (packet as unknown as Record<string, unknown>).spine = 'CORRECT';

    expect(resolveTeacherOverlayStyle(packet, 'spine')).toEqual({
      state: 'blocked',
      ...EXPECTED.blocked,
    });
  });

  it('rejects a packet from another stream, frame, or policy', () => {
    const packet = createBlockedPacket(2.5, 42);
    const current = {
      streamEpoch: 42,
      framePtsSeconds: 2.5,
      policyVersion: packet.policyVersion,
    };

    expect(isTeacherOverlayPacketCurrent(packet, current)).toBe(true);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, streamEpoch: 43 })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, framePtsSeconds: 2.6 })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, { ...current, policyVersion: 'old-policy' })).toBe(false);
    expect(isTeacherOverlayPacketCurrent(packet, undefined)).toBe(false);
  });

  it('keeps missing and blocked evidence free of semantic glow colors', () => {
    expect(resolveTeacherGlowType('heuristic_match')).toBe('GOOD');
    expect(resolveTeacherGlowType('heuristic_attention')).toBeUndefined();
    expect(resolveTeacherGlowType('heuristic_strong_attention')).toBe('CORRECTION');
    expect(resolveTeacherGlowType('heuristic_review')).toBeUndefined();
    expect(resolveTeacherGlowType('blocked')).toBeUndefined();
    expect(resolveTeacherGlowType(undefined)).toBeUndefined();
    expect(resolveTeacherGlowType('CORRECT')).toBeUndefined();
  });

  it('renders packet colors even when every legacy raw status says ERROR', () => {
    const strokes = renderTeacherPacket(0.95);

    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(true);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_strong_attention.color)).toBe(false);
  });

  it('colors every visible joint from its teacher region instead of leaving gray joint gaps', () => {
    const { canvas, fills } = createRecordingCanvas();
    const packet = createBlockedPacket(2.5, 42);
    for (const key of REGION_KEYS) packet[key] = 'heuristic_review';

    renderSkeletonToCanvas(
      canvas,
      SKELETON,
      { x: 500, y: 520 },
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        showSkeleton: true,
        showMotionTrails: false,
        showCoG: true,
        showAngleArcs: false,
        selectedJointId: '',
        isPlie: true,
        vaganovaAnalysis: rawAnalysis(0.95),
        overlayMode: 'lehrer-ampel',
        overlayPacket: packet,
        overlayFrameContext: {
          streamEpoch: 42,
          framePtsSeconds: 2.5,
          policyVersion: packet.policyVersion,
        },
      },
    );

    expect(fills).toContain(EXPECTED.heuristic_review.color);
    expect(fills).not.toContain('#e2e8f0');
  });

  it('keeps teacher traffic strokes stable when raw confidence changes', () => {
    const trafficStrokes = (confidence: number) => renderTeacherPacket(confidence)
      .filter(({ color }) => color === EXPECTED.heuristic_match.color);

    expect(trafficStrokes(0.05)).toEqual(trafficStrokes(0.99));
  });

  it('uses fine body strokes and a subtle micro-dot uncertainty texture', () => {
    const strokes = renderTeacherPacket(0.95);
    const traffic = strokes.filter(({ color }) => color === EXPECTED.heuristic_match.color);

    expect(Math.max(...traffic.map(({ width }) => width))).toBeLessThanOrEqual(3);
    expect(EXPECTED.heuristic_match_uncertain.dash[0]).toBeLessThan(1);
    expect(EXPECTED.heuristic_match_uncertain.dash[1]).toBeLessThanOrEqual(3.25);
  });

  it('renders a mismatched packet as neutral dashed geometry', () => {
    const strokes = renderTeacherPacket(0.95, {
      streamEpoch: 99,
      framePtsSeconds: 2.5,
      policyVersion: '0.4.0-phase-evidence-separation',
    });

    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_strong_attention.color)).toBe(false);
    expect(strokes.some(({ color, dash }) => (
      color === EXPECTED.blocked.color && dash.join(',') === EXPECTED.blocked.dash.join(',')
    ))).toBe(true);
  });

  it('does not replace teacher packet colors with amber selection status', () => {
    const strokes = renderTeacherPacket(0.95, undefined, 'port_de_bras_arms');

    expect(strokes.some(({ color }) => color === '#f59e0b')).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.heuristic_match.color)).toBe(true);
  });

  it('suppresses semantic glow when packet provenance is stale', () => {
    const strokes = renderTeacherPacket(0.95, {
      streamEpoch: 99,
      framePtsSeconds: 2.5,
      policyVersion: '0.4.0-phase-evidence-separation',
    }, 'port_de_bras_arms', 'CORRECTION');

    expect(strokes.some(({ color }) => color === '#ff6b6b')).toBe(false);
    expect(strokes.some(({ color }) => color === EXPECTED.blocked.color)).toBe(true);
  });

  it('draws the torso guide only for the current exact-frame grounded contract', () => {
    const points: PoseLandmark[] = Array.from({ length: 33 }, (_, index) => ({
      x: 0.2 + index * 0.01,
      y: 0.3 + index * 0.005,
      z: -index * 0.001,
      visibility: 0.95,
    }));
    const overlay = createBlockedPacket(2.5, 42);
    overlay.spine = 'heuristic_attention';
    const draft = buildGroundedTeacherDraft({
      metricAdapter: 'spine_tilt_aplomb',
      targetJointId: 'spine_center',
      isPaused: true,
      exactCacheLandmarks: points,
      posePacket: {
        streamEpoch: 42,
        frameSeq: 75,
        mediaTimeUs: 2_500_000,
        inferenceStartedAtMs: 1,
        inferenceEndedAtMs: 2,
        resultKind: 'pose',
        landmarks: points.map(point => ({ ...point })),
        avgVisibility: 0.95,
        source: 'frame_cache',
        generation: 7,
        sourceId: '/videos/nicole_saal_1.mp4',
        videoWidth: 960,
        videoHeight: 1280,
      },
      analysis: rawAnalysis(0.95),
      analysisMediaTimeUs: 2_500_000,
      overlayPacket: overlay,
      runtime: {
        sourceId: '/videos/nicole_saal_1.mp4',
        streamEpoch: 42,
        generation: 7,
        mediaTimeUs: 2_500_000,
        videoWidth: 960,
        videoHeight: 1280,
        policyVersion: '0.4.0-phase-evidence-separation',
      },
    });
    expect(draft.kind).toBe('ready');
    if (draft.kind !== 'ready') return;

    const renderGuide = (mediaTimeUs: number, includeGuide = true) => {
      const { canvas, strokes } = createRecordingCanvas();
      renderSkeletonToCanvas(
        canvas,
        SKELETON,
        { x: 500, y: 520 },
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          showSkeleton: true,
          showMotionTrails: false,
          showCoG: false,
          showAngleArcs: false,
          selectedJointId: 'spine_center',
          showIdealOverlay: true,
          groundedAplombGuide: includeGuide ? draft.guide : undefined,
          groundedGuideFrameContext: {
            ...readyInputContext,
            mediaTimeUs,
          },
          isPlie: true,
          vaganovaAnalysis: rawAnalysis(0.95),
          overlayMode: 'anatomisch',
        },
      );
      return strokes;
    };
    const readyInputContext = {
      sourceId: '/videos/nicole_saal_1.mp4',
      streamEpoch: 42,
      generation: 7,
      videoWidth: 960,
      videoHeight: 1280,
      policyVersion: '0.4.0-phase-evidence-separation',
    };

    const current = renderGuide(2_500_000);
    const stale = renderGuide(2_400_000);
    const missing = renderGuide(2_500_000, false);

    expect(current.some(({ color, dash }) => color === '#22c55e' && dash.join(',') === '14,8')).toBe(true);
    expect(stale.some(({ color }) => color === '#22c55e')).toBe(false);
    expect(missing.some(({ color }) => color === '#22c55e')).toBe(false);
  });

  it('draws a current grounded shoulder guide horizontally and rejects the wrong focus', () => {
    const guide: GroundedTeacherGuide = {
      kind: 'image_horizontal',
      anchor: 'shoulder_center',
      label: 'Schulter-Orientierung (2D) · Nicole prüft',
      reviewState: 'pending_nicole',
      evidence: {
        metricId: 'shoulder_horizontal',
        valueDeg: 7.5,
        confidence: 0.92,
        measurementClass: 'vaganova_relation',
        heuristicState: 'heuristic_attention',
        sourceId: 'clip-a',
        streamEpoch: 42,
        generation: 7,
        mediaTimeUs: 2_500_000,
        videoWidth: 1000,
        videoHeight: 1000,
        policyVersion: '0.4.0-phase-evidence-separation',
        source: 'exact_frame_cache',
      },
    };
    const renderGuide = (selectedJointId: string) => {
      const { canvas, strokes } = createRecordingCanvas();
      renderSkeletonToCanvas(
        canvas,
        SKELETON,
        { x: 500, y: 520 },
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          showSkeleton: true,
          showMotionTrails: false,
          showCoG: false,
          showAngleArcs: false,
          selectedJointId,
          showIdealOverlay: true,
          groundedAplombGuide: guide,
          groundedGuideFrameContext: {
            sourceId: 'clip-a',
            streamEpoch: 42,
            generation: 7,
            mediaTimeUs: 2_500_000,
            videoWidth: 1000,
            videoHeight: 1000,
            policyVersion: '0.4.0-phase-evidence-separation',
          },
          isPlie: true,
          vaganovaAnalysis: rawAnalysis(0.95),
          overlayMode: 'anatomisch',
        },
      );
      return strokes;
    };

    expect(renderGuide('shoulder_line').some(({ color, dash }) => (
      color === '#22c55e' && dash.join(',') === '14,8'
    ))).toBe(true);
    expect(renderGuide('spine_center').some(({ color }) => color === '#22c55e')).toBe(false);
  });

  it('outlines the exact selected bone in amber only for the matching frame identity', () => {
    const renderSelection = (mediaTimeUs: number) => {
      const { canvas, strokes } = createRecordingCanvas();
      renderSkeletonToCanvas(
        canvas,
        SKELETON,
        { x: 500, y: 520 },
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          showSkeleton: true,
          showMotionTrails: false,
          showCoG: false,
          showAngleArcs: false,
          selectedJointId: 'left_elbow',
          selectedSkeletonTarget: {
            targetId: 'bone.upper_arm_l',
            kind: 'bone',
            anchorNormalized: { x: 0.36, y: 0.25 },
            sourceId: 'clip-a',
            streamEpoch: 42,
            generation: 7,
            mediaTimeUs: 2_500_000,
            segmentT: 0.4,
            frameStatus: 'exact_cache_frame',
          },
          selectedTargetFrameContext: {
            sourceId: 'clip-a',
            streamEpoch: 42,
            generation: 7,
            mediaTimeUs,
          },
          isPlie: true,
          vaganovaAnalysis: rawAnalysis(0.95),
          overlayMode: 'anatomisch',
        },
      );
      return strokes.filter(stroke => stroke.color === '#f59e0b');
    };

    expect(renderSelection(2_500_000)).toHaveLength(1);
    expect(renderSelection(2_400_000)).toHaveLength(0);
  });

  it('draws a Nicole-owned reference cyan, never green, and rejects stale frame identity', () => {
    const renderReference = (mediaTimeUs: number, targetId: 'bone.forearm_l' | 'bone.forearm_r' = 'bone.forearm_l', tamper = false) => {
      const { canvas, strokes } = createRecordingCanvas();
      const guideCore = {
        schemaVersion: 1 as const, recordId: 'record', versionId: 'version', versionNumber: 3,
        videoSourceId: 'clip-a', targetId: 'bone.forearm_l' as const, targetKind: 'bone' as const, videoWidth: 1000, videoHeight: 1000,
        sourceMediaTimeUs: 1_500_000, direction: { x: 1, y: 0 }, label: 'Nicole-Referenzlinie' as const, teacherId: 'nicole' as const,
        versionDigest: 'a'.repeat(64), digestAlgorithm: NICOLE_REFERENCE_DIGEST_ALGORITHM,
      };
      const guide = { ...guideCore, guideDigest: sha256Canonical(guideCore) };
      renderSkeletonToCanvas(
        canvas, SKELETON, { x: 500, y: 520 }, {} as never, {} as never, {} as never, {} as never, {} as never,
        {
          showSkeleton: true, showMotionTrails: false, showCoG: false, showAngleArcs: false,
          selectedJointId: 'left_elbow',
          selectedSkeletonTarget: {
            targetId, kind: 'bone', anchorNormalized: { x: 0.3, y: 0.3 }, sourceId: 'clip-a',
            streamEpoch: 4, generation: 2, mediaTimeUs: 2_500_000, frameStatus: 'exact_cache_frame',
          },
          selectedTargetFrameContext: { sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs },
          nicoleReferenceGuide: tamper ? { ...guide, direction: { x: 0, y: 1 } } : guide,
          nicoleReferenceFrameContext: { sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs, videoWidth: 1000, videoHeight: 1000 },
          isPlie: true, vaganovaAnalysis: rawAnalysis(0.95), overlayMode: 'anatomisch',
        },
      );
      return strokes;
    };

    expect(renderReference(2_500_000).some(stroke => stroke.color === '#22d3ee' && stroke.dash.join(',') === '11,7')).toBe(true);
    expect(renderReference(2_500_000).some(stroke => stroke.color === '#22c55e')).toBe(false);
    expect(renderReference(2_400_000).some(stroke => stroke.color === '#22d3ee')).toBe(false);
    expect(renderReference(2_500_000, 'bone.forearm_r').some(stroke => stroke.color === '#22d3ee')).toBe(false);
    expect(renderReference(2_500_000, 'bone.forearm_l', true).some(stroke => stroke.color === '#22d3ee')).toBe(false);
  });

  it('keeps the Nicole label at least 10 CSS px on a DPR-scaled canvas', () => {
    const { canvas } = createRecordingCanvas(500);
    const context = canvas.getContext('2d') as unknown as { font: string };
    const guideCore = {
      schemaVersion: 1 as const, recordId: 'record', versionId: 'version', versionNumber: 1,
      videoSourceId: 'clip-a', targetId: 'bone.forearm_l' as const, targetKind: 'bone' as const,
      videoWidth: 1000, videoHeight: 1000, sourceMediaTimeUs: 1_000_000,
      direction: { x: 1, y: 0 }, label: 'Nicole-Referenzlinie' as const, teacherId: 'nicole' as const,
      versionDigest: 'a'.repeat(64), digestAlgorithm: NICOLE_REFERENCE_DIGEST_ALGORITHM,
    };
    renderSkeletonToCanvas(
      canvas, SKELETON, { x: 500, y: 520 }, {} as never, {} as never, {} as never, {} as never, {} as never,
      {
        showSkeleton: true, showMotionTrails: false, showCoG: false, showAngleArcs: false,
        selectedJointId: 'left_elbow',
        selectedSkeletonTarget: { targetId: 'bone.forearm_l', kind: 'bone', anchorNormalized: { x: 0.3, y: 0.3 }, sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs: 2_500_000, frameStatus: 'exact_cache_frame' },
        selectedTargetFrameContext: { sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs: 2_500_000 },
        nicoleReferenceGuide: { ...guideCore, guideDigest: sha256Canonical(guideCore) },
        nicoleReferenceFrameContext: { sourceId: 'clip-a', streamEpoch: 4, generation: 2, mediaTimeUs: 2_500_000, videoWidth: 1000, videoHeight: 1000 },
        isPlie: true, vaganovaAnalysis: rawAnalysis(0.95), overlayMode: 'anatomisch',
      },
    );
    expect(context.font).toContain('20px');
  });
});
