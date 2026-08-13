import { describe, expect, it } from 'vitest';
import {
  buildGroundedTeacherDraft,
  findNearestExactPoseFrame,
  groundedTeacherDraftFingerprint,
  isGroundedAplombGuideCurrent,
  type GroundedTeacherDraftInput,
} from '../services/groundedTeacherDraftEngine';
import type { PoseLandmark } from '../services/realMediaPipePose';
import type { VaganovaFullAnalysis, VaganovaMeasurement } from '../services/vaganovaAngleCalculator';
import { createBlockedPacket } from '../types/teacherHeuristic';

const landmarks: PoseLandmark[] = Array.from({ length: 33 }, (_, index) => ({
  x: 0.2 + index * 0.01,
  y: 0.3 + index * 0.005,
  z: -index * 0.001,
  visibility: 0.95,
}));

const measurement: VaganovaMeasurement = {
  value: 6.25,
  unit: 'deg',
  confidence: 0.91,
  label: 'Aplomb (Rumpfneigung)',
  measurement_class: 'vaganova_relation',
};

function analysis(spineTilt: VaganovaMeasurement | null = measurement): VaganovaFullAnalysis {
  return {
    knieFlexionL: null,
    knieFlexionR: null,
    valgusDriftL: null,
    valgusDriftR: null,
    turnoutL: null,
    turnoutR: null,
    spineTilt,
    epaulement: null,
    portDeBrasL: null,
    portDeBrasR: null,
    pelvicTilt: null,
    shoulderSymmetry: null,
    shoulderElevationL: null,
    shoulderElevationR: null,
    armLineQualityL: null,
    armLineQualityR: null,
    headTilt: null,
    plumbDeviation: null,
  };
}

function readyInput(): GroundedTeacherDraftInput {
  const overlay = createBlockedPacket(2.5, 42);
  overlay.spine = 'heuristic_attention';
  return {
    metricAdapter: 'spine_tilt_aplomb',
    targetJointId: 'spine_center',
    isPaused: true,
    exactCacheLandmarks: landmarks,
    posePacket: {
      streamEpoch: 42,
      frameSeq: 75,
      mediaTimeUs: 2_500_000,
      inferenceStartedAtMs: 1,
      inferenceEndedAtMs: 2,
      resultKind: 'pose',
      landmarks: landmarks.map(point => ({ ...point })),
      avgVisibility: 0.95,
      source: 'frame_cache',
      generation: 7,
      sourceId: '/videos/nicole_saal_1.mp4',
      videoWidth: 960,
      videoHeight: 1280,
    },
    analysis: analysis(),
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
  };
}

describe('grounded torso teacher draft', () => {
  it('snaps an arbitrary click only to the nearest real cache entry', () => {
    const frames = [
      { timeMs: 1000, resultKind: 'pose' as const, landmarks },
      { timeMs: 1033.333, resultKind: 'pose' as const, landmarks },
      { timeMs: 1066.667, resultKind: 'pose' as const, landmarks },
    ];

    expect(findNearestExactPoseFrame(frames, 1.044346)?.timeMs).toBe(1033.333);
    expect(findNearestExactPoseFrame(frames, 1.05)?.timeMs).toBe(1033.333);
    expect(findNearestExactPoseFrame(frames, 1.2)).toBeNull();
  });

  it('never skips a nearer no-pose entry to manufacture pose evidence', () => {
    const frames = [
      { timeMs: 1000, resultKind: 'pose' as const, landmarks },
      { timeMs: 1033.333, resultKind: 'no_pose' as const, landmarks: null },
      { timeMs: 1066.667, resultKind: 'pose' as const, landmarks },
    ];

    expect(findNearestExactPoseFrame(frames, 1.034)).toBeNull();
    expect(findNearestExactPoseFrame(frames, 1.05)).toBeNull();
  });

  it('builds deterministic rich copy only for one exact, current cache frame', () => {
    const first = buildGroundedTeacherDraft(readyInput());
    const second = buildGroundedTeacherDraft(readyInput());

    expect(first).toEqual(second);
    expect(groundedTeacherDraftFingerprint(first)).toBe(groundedTeacherDraftFingerprint(second));
    expect(first.kind).toBe('ready');
    if (first.kind !== 'ready') return;

    expect(first.reviewState).toBe('pending_nicole');
    expect(first.learnerVisible).toBe(false);
    expect(first.parentVisible).toBe(false);
    expect(first.evidence).toMatchObject({
      metricId: 'spine_tilt_aplomb',
      valueDeg: 6.25,
      source: 'exact_frame_cache',
      sourceId: '/videos/nicole_saal_1.mp4',
      mediaTimeUs: 2_500_000,
    });
    expect(first.sections.what).toContain('6.3°');
    expect(first.sections.whyConditional).toContain('Falls Nicole');
    expect(first.sections.practiceForTeacherReview).toContain('Nicole');
    expect(first.sections.metaphor).toContain('goldenen Faden');
    expect(first.sections.limitations).toContain('nicht bestimmbar');
    expect(first.guide.label).toBe('Aplomb-Orientierung (2D) · Nicole prüft');
  });

  it.each([
    {
      metricAdapter: 'shoulder_horizontal' as const,
      targetJointId: 'shoulder_line',
      measurementKey: 'shoulderSymmetry' as const,
      overlayKey: 'shoulder' as const,
      expectedLabel: 'Schulter-Orientierung (2D) · Nicole prüft',
      expectedCopy: 'Schulterlinie',
    },
    {
      metricAdapter: 'projected_hip_line_obliquity' as const,
      targetJointId: 'pelvis_core',
      measurementKey: 'pelvicTilt' as const,
      overlayKey: 'pelvis' as const,
      expectedLabel: 'Becken-Orientierung (2D) · Nicole prüft',
      expectedCopy: 'Beckenlinie',
    },
  ])('builds a conditional exact-frame draft for $metricAdapter', profile => {
    const input = readyInput();
    input.metricAdapter = profile.metricAdapter;
    input.targetJointId = profile.targetJointId;
    input.analysis = { ...analysis(null), [profile.measurementKey]: measurement };
    input.overlayPacket!.spine = 'blocked';
    input.overlayPacket![profile.overlayKey] = 'heuristic_attention';

    const draft = buildGroundedTeacherDraft(input);
    expect(draft.kind).toBe('ready');
    if (draft.kind !== 'ready') return;
    expect(draft.evidence.metricId).toBe(profile.metricAdapter);
    expect(draft.target).toBe(profile.targetJointId);
    expect(draft.guide.kind).toBe('image_horizontal');
    expect(draft.guide.label).toBe(profile.expectedLabel);
    expect(draft.sections.what).toContain(profile.expectedCopy);
    expect(draft.sections.whyConditional).toContain('Falls Nicole');
    expect(draft.sections.limitations).toMatch(/2D|Bildprojektion/);
  });

  it.each([
    ['wrong target', (input: GroundedTeacherDraftInput) => { input.targetJointId = 'left_knee'; }],
    ['playing', (input: GroundedTeacherDraftInput) => { input.isPaused = false; }],
    ['missing exact cache', (input: GroundedTeacherDraftInput) => { input.exactCacheLandmarks = null; }],
    ['live inference', (input: GroundedTeacherDraftInput) => { input.posePacket!.source = 'live_inference'; }],
    ['wrong source', (input: GroundedTeacherDraftInput) => { input.posePacket!.sourceId = 'other.mp4'; }],
    ['wrong epoch', (input: GroundedTeacherDraftInput) => { input.posePacket!.streamEpoch = 41; }],
    ['wrong generation', (input: GroundedTeacherDraftInput) => { input.posePacket!.generation = 6; }],
    ['wrong media time', (input: GroundedTeacherDraftInput) => { input.posePacket!.mediaTimeUs = 2_400_000; }],
    ['wrong dimensions', (input: GroundedTeacherDraftInput) => { input.posePacket!.videoWidth = 640; }],
    ['empty source', (input: GroundedTeacherDraftInput) => { input.runtime.sourceId = ''; input.posePacket!.sourceId = ''; }],
    ['empty policy', (input: GroundedTeacherDraftInput) => { input.runtime.policyVersion = ''; input.overlayPacket!.policyVersion = ''; }],
    ['invalid epoch', (input: GroundedTeacherDraftInput) => { input.runtime.streamEpoch = Number.NaN; input.posePacket!.streamEpoch = Number.NaN; input.overlayPacket!.streamEpoch = Number.NaN; }],
    ['invalid generation', (input: GroundedTeacherDraftInput) => { input.runtime.generation = Number.NaN; input.posePacket!.generation = Number.NaN; }],
    ['different geometry', (input: GroundedTeacherDraftInput) => { input.posePacket!.landmarks[11].x += 0.01; }],
    ['stale analysis', (input: GroundedTeacherDraftInput) => { input.analysisMediaTimeUs = 2_400_000; }],
    ['missing analysis', (input: GroundedTeacherDraftInput) => { input.analysis = null; }],
    ['stale overlay', (input: GroundedTeacherDraftInput) => { input.overlayPacket!.framePtsSeconds = 2.4; }],
    ['blocked overlay', (input: GroundedTeacherDraftInput) => { input.overlayPacket!.spine = 'blocked'; }],
  ])('fails closed for %s', (_name, mutate) => {
    const input = readyInput();
    mutate(input);
    const draft = buildGroundedTeacherDraft(input);

    expect(draft.kind).toBe('blocked');
    expect(JSON.stringify(draft)).not.toMatch(/valueDeg|guide|learnerVisible|parentVisible/);
  });

  it('rejects not-measurable, malformed and unauthorized spine evidence', () => {
    const unavailable = readyInput();
    unavailable.analysis = analysis({
      measurement_class: 'not_measurable',
      confidence: 0.9,
      label: 'nicht messbar',
      not_measurable_reason: 'blocked',
    });
    expect(buildGroundedTeacherDraft(unavailable).kind).toBe('blocked');

    const wrongClass = readyInput();
    wrongClass.analysis = analysis({ ...measurement, measurement_class: 'research_observation' });
    expect(buildGroundedTeacherDraft(wrongClass).kind).toBe('blocked');

    const invalidConfidence = readyInput();
    invalidConfidence.analysis = analysis({ ...measurement, confidence: Number.NaN });
    expect(buildGroundedTeacherDraft(invalidConfidence).kind).toBe('blocked');
  });

  it('contains no asserted medical, muscle, injury or prognostic claim', () => {
    const draft = buildGroundedTeacherDraft(readyInput());
    expect(draft.kind).toBe('ready');
    const text = JSON.stringify(draft);

    expect(text).not.toMatch(/Diagnose|Verletzung|Prognose|Muskelschwäche|Muskeldefizit|70\s*%|30\s*%/i);
    expect(text).not.toMatch(/ist zu schwach|verursacht|führt sicher|korrigiert sich/i);
  });

  it('rejects a guide from another source, frame, stream, generation, size or policy', () => {
    const draft = buildGroundedTeacherDraft(readyInput());
    expect(draft.kind).toBe('ready');
    if (draft.kind !== 'ready') return;
    const context = { ...readyInput().runtime };

    expect(isGroundedAplombGuideCurrent(draft.guide, context)).toBe(true);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, sourceId: 'other' })).toBe(false);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, mediaTimeUs: 2_400_000 })).toBe(false);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, streamEpoch: 43 })).toBe(false);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, generation: 8 })).toBe(false);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, videoWidth: 961 })).toBe(false);
    expect(isGroundedAplombGuideCurrent(draft.guide, { ...context, policyVersion: 'old' })).toBe(false);

    const malformed = {
      ...draft.guide,
      evidence: { ...draft.guide.evidence, heuristicState: 'CORRECT' },
    } as unknown as typeof draft.guide;
    expect(isGroundedAplombGuideCurrent(malformed, context)).toBe(false);
  });
});
