// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkeletonJointPopover } from '../components/SkeletonJointPopover';
import { JOINT_KNOWLEDGE } from '../services/skeletonJointKnowledge';
import {
  VaganovaFullAnalysis,
  VaganovaMeasurement,
} from '../services/vaganovaAngleCalculator';
import { buildGroundedTeacherDraft } from '../services/groundedTeacherDraftEngine';
import type { GroundedTeacherDraft } from '../types/groundedTeacherDraft';
import { createBlockedPacket } from '../types/teacherHeuristic';
import { getSkeletonTarget } from '../services/skeletonTargetRegistry';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
}

afterEach(() => {
  cleanup();
  setViewportWidth(1024);
});

function analysis(kneeMeasurements: Partial<VaganovaFullAnalysis>): VaganovaFullAnalysis {
  return {
    knieFlexionL: null,
    knieFlexionR: null,
    valgusDriftL: null,
    valgusDriftR: null,
    turnoutL: null,
    turnoutR: null,
    spineTilt: null,
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
    ...kneeMeasurements,
  };
}

function measurable(status?: 'CORRECT' | 'WARNING' | 'ERROR'): VaganovaMeasurement {
  return {
    value: 160,
    unit: 'deg',
    confidence: 0.95,
    label: 'Testmessung',
    measurement_class: 'vaganova_relation',
    status,
  };
}

function renderJoint(
  landmarkIndex: number,
  vaganovaAnalysis: VaganovaFullAnalysis | null,
  groundedTeacherDraft?: GroundedTeacherDraft,
) {
  return render(
    <SkeletonJointPopover
      knowledge={JOINT_KNOWLEDGE[landmarkIndex]}
      jointX={300}
      jointY={300}
      videoLeft={0}
      containerHeight={700}
      onClose={() => undefined}
      vaganovaAnalysis={vaganovaAnalysis}
      landmarkIndex={landmarkIndex}
      groundedTeacherDraft={groundedTeacherDraft}
    />,
  );
}

function renderTarget(
  targetId: string,
  vaganovaAnalysis: VaganovaFullAnalysis | null,
  groundedTeacherDraft?: GroundedTeacherDraft,
) {
  const target = getSkeletonTarget(targetId);
  if (!target) throw new Error(`Missing test target ${targetId}`);
  return render(
    <SkeletonJointPopover
      knowledge={JOINT_KNOWLEDGE[target.representativeLandmarkIndex]}
      jointX={300}
      jointY={300}
      videoLeft={0}
      containerHeight={700}
      onClose={() => undefined}
      vaganovaAnalysis={vaganovaAnalysis}
      landmarkIndex={target.representativeLandmarkIndex}
      groundedTeacherDraft={groundedTeacherDraft}
      selectedTarget={target}
      selectedTargetIdentity={{
        targetId: target.id,
        kind: target.kind,
        anchorNormalized: { x: 0.3, y: 0.3 },
        sourceId: 'clip-a',
        streamEpoch: 4,
        generation: 2,
        mediaTimeUs: 1_500_000,
        frameStatus: 'exact_cache_frame',
      }}
    />,
  );
}

describe('SkeletonJointPopover evidence color semantics', () => {
  it('offers versioned Nicole-reference saving only when explicitly wired for a bone', () => {
    const target = getSkeletonTarget('bone.forearm_l')!;
    const onSave = vi.fn(() => true);
    render(
      <SkeletonJointPopover
        knowledge={JOINT_KNOWLEDGE[target.representativeLandmarkIndex]}
        jointX={300}
        jointY={300}
        videoLeft={0}
        containerHeight={700}
        onClose={() => undefined}
        landmarkIndex={target.representativeLandmarkIndex}
        selectedTarget={target}
        onSaveNicoleReference={onSave}
        nicoleReferenceVersion={2}
      />,
    );
    screen.getByText('Neue Nicole-Referenzversion speichern · aktuell V2').click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it('keeps the fixed popover fully inside a 390px viewport', () => {
    setViewportWidth(390);
    const { container } = renderJoint(100, analysis({}), undefined);
    const popover = container.ownerDocument.querySelector('.skeleton-popover-scroll') as HTMLElement;

    expect(popover.style.width).toBe('280px');
    const left = 390 - Number.parseFloat(popover.style.right) - Number.parseFloat(popover.style.width);
    expect(left).toBe(8);
  });

  it('preserves the canonical desktop popover position', () => {
    setViewportWidth(1440);
    const { container } = renderJoint(100, analysis({}), undefined);
    const popover = container.ownerDocument.querySelector('.skeleton-popover-scroll') as HTMLElement;

    expect(popover.style.width).toBe('280px');
    expect(popover.style.right).toBe('356px');
  });

  it('renders unavailable knee evidence neutral, never as correct', () => {
    renderJoint(25, analysis({
      valgusDriftL: {
        measurement_class: 'not_measurable',
        confidence: 0.95,
        label: 'Projizierte Knieachse (nicht bewertet)',
        not_measurable_reason: 'Kein gültiger Referenzanker.',
      },
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
    expect(screen.getByText('Kein gültiger Referenzanker.')).toBeTruthy();
  });

  it('keeps mixed correct and statusless evidence neutral', () => {
    renderJoint(25, analysis({
      knieFlexionL: measurable('CORRECT'),
      turnoutL: measurable(),
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('shows correct only when every relevant measurement is explicitly correct', () => {
    renderJoint(13, analysis({
      armLineQualityL: measurable('CORRECT'),
      portDeBrasL: measurable('CORRECT'),
    }));

    expect(screen.getByText('✓ Richtig ausgeführt')).toBeTruthy();
  });

  it('keeps a knee neutral when one expected measurement is missing', () => {
    renderJoint(25, analysis({
      knieFlexionL: measurable('CORRECT'),
      valgusDriftL: null,
      turnoutL: measurable('CORRECT'),
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('keeps an ankle neutral when the unavailable knee-axis slot is missing', () => {
    renderJoint(27, analysis({
      knieFlexionL: measurable('CORRECT'),
      valgusDriftL: null,
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.queryByText('✓ Richtig ausgeführt')).toBeNull();
  });

  it('frames an unavailable ankle observation as neutral context, not a current cause', () => {
    renderJoint(27, analysis({
      valgusDriftL: {
        measurement_class: 'not_measurable',
        confidence: 0.95,
        label: 'Projizierte Knieachse (nicht bewertet)',
        not_measurable_reason: 'Kein gültiger Referenzanker.',
      },
    }));

    expect(screen.getByText('○ Nicht automatisch bewertet')).toBeTruthy();
    expect(screen.getByText('Pädagogischer Kontext')).toBeTruthy();
    expect(screen.queryByText('Warum ist das problematisch?')).toBeNull();
    expect(screen.queryByText(/Pronation = oft Ursache|Theraband Knöchel-Kräftigung/i)).toBeNull();
  });

  it('renders the exact-frame torso draft as rich pending-Nicole coaching', () => {
    const points = Array.from({ length: 33 }, (_, index) => ({
      x: 0.2 + index * 0.01,
      y: 0.3 + index * 0.005,
      z: -index * 0.001,
      visibility: 0.95,
    }));
    const torsoAnalysis = analysis({
      spineTilt: {
        value: 6.25,
        unit: 'deg',
        confidence: 0.91,
        label: 'Aplomb',
        measurement_class: 'vaganova_relation',
      },
    });
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
      analysis: torsoAnalysis,
      analysisMediaTimeUs: 2_500_000,
      overlayPacket: overlay,
      runtime: {
        sourceId: '/videos/nicole_saal_1.mp4',
        streamEpoch: 42,
        generation: 7,
        mediaTimeUs: 2_500_000,
        videoWidth: 960,
        videoHeight: 1280,
        policyVersion: '0.2.0-teacher-ampel',
      },
    });

    renderJoint(100, torsoAnalysis, draft);

    expect(screen.getByText('KI-Entwurf · Nicole prüft')).toBeTruthy();
    expect(screen.getByText('Was wir sehen')).toBeTruthy();
    expect(screen.getByText('Warum das technisch wichtig sein kann')).toBeTruthy();
    expect(screen.getByText('Zielbild für Nicoles Prüfung')).toBeTruthy();
    expect(screen.getByText('Üben & verbessern')).toBeTruthy();
    expect(screen.getByText('Metapher / Bild')).toBeTruthy();
    expect(screen.getByText('Technik für Nicole')).toBeTruthy();
    expect(screen.getByText('Grenzen & Prüffragen')).toBeTruthy();
    expect(screen.getAllByText(/6\.3°/)).toHaveLength(2);
    expect(screen.queryByText('Oberkörper neigt sich beim Plie nach vorne oder zur Seite.')).toBeNull();
    expect(screen.queryByText(/Beckenboden aktiv|10x/)).toBeNull();
  });

  it('renders an exact shoulder-line draft instead of generic neutral copy', () => {
    const points = Array.from({ length: 33 }, (_, index) => ({
      x: 0.2 + index * 0.01,
      y: 0.3 + index * 0.005,
      z: -index * 0.001,
      visibility: 0.95,
    }));
    const shoulderAnalysis = analysis({
      shoulderSymmetry: {
        value: 7.5,
        unit: 'deg',
        confidence: 0.92,
        label: 'Schulterlinie',
        measurement_class: 'vaganova_relation',
      },
    });
    const overlay = createBlockedPacket(2.5, 42);
    overlay.shoulder = 'heuristic_attention';
    const draft = buildGroundedTeacherDraft({
      metricAdapter: 'shoulder_horizontal',
      targetJointId: 'shoulder_line',
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
      analysis: shoulderAnalysis,
      analysisMediaTimeUs: 2_500_000,
      overlayPacket: overlay,
      runtime: {
        sourceId: '/videos/nicole_saal_1.mp4',
        streamEpoch: 42,
        generation: 7,
        mediaTimeUs: 2_500_000,
        videoWidth: 960,
        videoHeight: 1280,
        policyVersion: '0.2.0-teacher-ampel',
      },
    });

    renderTarget('bone.shoulder_line', shoulderAnalysis, draft);

    expect(screen.getByText('KI-Entwurf · Nicole prüft')).toBeTruthy();
    expect(screen.getAllByText(/7\.5°/)).toHaveLength(2);
    expect(screen.getAllByText(/beabsichtigtes Épaulement/i)).toHaveLength(2);
    expect(screen.queryByText(/noch kein freigegebener Exact-Frame-Adapter/i)).toBeNull();

    cleanup();
    renderJoint(100, shoulderAnalysis, draft);
    expect(screen.queryByText('KI-Entwurf · Nicole prüft')).toBeNull();
    expect(screen.getByText('Noch keine gesicherte Frame-Evidenz')).toBeTruthy();
  });

  it('renders a blocked torso as neutral only, never as legacy coaching', () => {
    renderJoint(100, analysis({}), {
      kind: 'blocked',
      target: 'spine_center',
      reason: 'exact_cache_frame_missing',
      message: 'Für diesen Zeitpunkt liegt kein exakter Analyseframe vor.',
    });

    expect(screen.getByText('Noch keine gesicherte Frame-Evidenz')).toBeTruthy();
    expect(screen.getByText('Für diesen Zeitpunkt liegt kein exakter Analyseframe vor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inhalt in Zwischenablage kopieren' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText(/Beckenboden aktiv|10x|destabilisiert die Balance/i)).toBeNull();
    expect(screen.queryByText('Vaganova-Standard')).toBeNull();
    expect(screen.queryByText('Aplomb-Training an der Stange')).toBeNull();
  });

  it('fails closed when the torso draft prop is missing', () => {
    renderJoint(100, analysis({}), undefined);

    expect(screen.getByText('Noch keine gesicherte Frame-Evidenz')).toBeTruthy();
    expect(screen.getByText('Für diesen Zeitpunkt liegt noch kein abgesicherter Lehrerentwurf vor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inhalt in Zwischenablage kopieren' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText(/Beckenboden aktiv|10x|destabilisiert die Balance/i)).toBeNull();
    expect(screen.queryByText('Vaganova-Standard')).toBeNull();
    expect(screen.queryByText('Aplomb-Training an der Stange')).toBeNull();
  });

  it('renders a non-grounded bone as an exact neutral target without legacy claims', () => {
    renderTarget('bone.upper_arm_l', analysis({
      armLineQualityL: measurable('ERROR'),
      portDeBrasL: measurable('ERROR'),
    }));

    expect(screen.getByText('Linker Oberarm')).toBeTruthy();
    expect(screen.getByText('Bone · exakter Analyseframe')).toBeTruthy();
    expect(screen.getByText('Ziel ausgewählt · noch keine automatische Bewertung')).toBeTruthy();
    expect(screen.getByText(/bone\.upper_arm_l/)).toBeTruthy();
    expect(screen.queryByText(/Ast im Wind|Port de Bras Arm-Linien-Training|Korrektur erforderlich/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Inhalt in Zwischenablage kopieren' }).hasAttribute('disabled')).toBe(true);
  });
});
