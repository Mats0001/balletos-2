import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameEntry } from '../services/frameInterpolator';
import { PoseLandmark } from '../services/realMediaPipePose';
import {
  VaganovaAngleCalculator,
  VaganovaFullAnalysis,
  VaganovaMeasurement,
  vaganovaAngleCalculator,
} from '../services/vaganovaAngleCalculator';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import {
  VaganovaCuePoint,
  analyzeFrameCacheForHighlights,
  replaceAutoCuePoints,
} from '../services/vaganovaPreAnalyzer';

function landmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: 0.2 + (index % 6) * 0.1,
    y: 0.1 + Math.floor(index / 6) * 0.12,
    z: 0,
    visibility: 0.95,
  }));
}

function frames(): FrameEntry[] {
  return Array.from({ length: 5 }, (_, index) => ({
    timeMs: index * 100,
    resultKind: 'pose' as const,
    landmarks: landmarks(),
  }));
}

function measurement(
  value: number,
  measurementClass: 'not_measurable' | 'individual_baseline',
): VaganovaMeasurement {
  return {
    value,
    confidence: 0.95,
    unit: measurementClass === 'not_measurable' ? 'deg' : 'delta_deg',
    label: 'non-authoritative knee shadow metric',
    measurement_class: measurementClass,
  };
}

function relation(value: number): VaganovaMeasurement {
  return {
    value,
    confidence: 0.95,
    unit: 'deg',
    label: 'projected relation',
    measurement_class: 'vaganova_relation',
    status: 'ERROR',
  };
}

function analysis(overrides: Partial<VaganovaFullAnalysis> = {}): VaganovaFullAnalysis {
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
    ...overrides,
  };
}

function prepareScan(result: VaganovaFullAnalysis): void {
  vi.spyOn(vaganovaFrameCache, 'getFrames').mockReturnValue(frames());
  vi.spyOn(vaganovaFrameCache, 'getVideoDimensions').mockReturnValue({ vw: 960, vh: 1280 });
  vi.spyOn(VaganovaAngleCalculator.prototype, 'analyzeFullFrame').mockReturnValue(result);
}

function cue(
  id: string,
  dataSource: NonNullable<VaganovaCuePoint['dataSource']>,
  timeSeconds: number,
  provenance?: VaganovaCuePoint['provenance'],
): VaganovaCuePoint {
  return {
    id,
    timeSeconds,
    timecodeStr: '00:00.000',
    poseName: id,
    status: 'CORRECTION',
    headline: id,
    cueMetaphor: id,
    jointFocusId: 'right_knee',
    dataSource,
    provenance,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('analyzeFrameCacheForHighlights knee evidence gate', () => {
  it.each([
    ['not measurable absolute value', 99, 'not_measurable'],
    ['positive individual-baseline delta', 24, 'individual_baseline'],
    ['negative individual-baseline delta', -24, 'individual_baseline'],
  ] as const)('does not turn %s into an automatic knee claim', (_label, value, metricClass) => {
    prepareScan(analysis({
      valgusDriftL: measurement(value, metricClass),
      valgusDriftR: measurement(-value, metricClass),
    }));

    const result = analyzeFrameCacheForHighlights('knee-only.mp4');
    const generatedText = JSON.stringify(result);

    expect(result.autoCuePoints).toEqual([]);
    expect(result.report.strengths).toEqual([]);
    expect(result.report.corrections).toEqual([]);
    expect(generatedText).not.toMatch(/Knie|Valgus|medial|Außenrotator|Pronation|6 Metriken/i);
  });

  it('uses a scan-local calculator instead of mutating the live singleton', () => {
    const globalSpy = vi.spyOn(vaganovaAngleCalculator, 'analyzeFullFrame');
    const localSpy = vi
      .spyOn(VaganovaAngleCalculator.prototype, 'analyzeFullFrame')
      .mockReturnValue(analysis());
    vi.spyOn(vaganovaFrameCache, 'getFrames').mockReturnValue(frames());
    vi.spyOn(vaganovaFrameCache, 'getVideoDimensions').mockReturnValue({ vw: 960, vh: 1280 });

    analyzeFrameCacheForHighlights('isolated-scan.mp4');

    expect(localSpy).toHaveBeenCalledTimes(5);
    expect(globalSpy).not.toHaveBeenCalled();
  });

  it('is deterministic for identical cached evidence', () => {
    prepareScan(analysis({
      valgusDriftL: measurement(42, 'not_measurable'),
      valgusDriftR: measurement(-42, 'not_measurable'),
    }));

    const first = analyzeFrameCacheForHighlights('same-evidence.mp4');
    const second = analyzeFrameCacheForHighlights('same-evidence.mp4');

    expect(second).toEqual(first);
  });

  it('does not create a positive aggregate from knee or non-measurable proxies', () => {
    prepareScan(analysis({
      valgusDriftL: measurement(0, 'not_measurable'),
      valgusDriftR: measurement(0, 'not_measurable'),
      plumbDeviation: measurement(0, 'not_measurable'),
    }));

    const result = analyzeFrameCacheForHighlights('no-positive-aggregate.mp4');

    expect(result.autoCuePoints).toEqual([]);
    expect(result.report.strengths).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/Bester Frame|Gesamtmoment|im grünen Bereich/i);
  });

  it('marks every generated automatic cue as pending and not publishable', () => {
    prepareScan(analysis({ spineTilt: relation(15) }));

    const result = analyzeFrameCacheForHighlights('pending-provenance.mp4');

    expect(result.autoCuePoints.length).toBeGreaterThan(0);
    for (const point of result.autoCuePoints) {
      expect(point.dataSource).toBe('KI_AUTO');
      expect(point.provenance).toBe('ki_suggestion');
      expect(point.learnerVisible).toBe(false);
      expect(point.parentVisible).toBe(false);
      expect(point.kiSuggestionData).toMatchObject({
        originalHeadline: point.headline,
        originalCueMetaphor: point.cueMetaphor,
        originalDiagnosisText: point.diagnosisText,
        originalGoalText: point.goalText,
        originalPracticeText: point.practiceText,
        originalTechnicalAnalysis: point.technicalAnalysis,
        ampelStatus: point.status === 'WARNING' ? 'WARNING' : 'ERROR',
      });
      expect(point.kiSuggestionData?.policyVersion).toBeTruthy();
      expect(Number.isNaN(Date.parse(point.kiSuggestionData?.generatedAt ?? ''))).toBe(false);
    }
  });
});

describe('replaceAutoCuePoints', () => {
  it('removes stale unreviewed AI cues even when the next scan is empty', () => {
    const teacher = cue('teacher', 'TEACHER_CREATED', 2);
    const demo = cue('demo', 'DEMO_FIXTURE', 3);
    const stale = cue('stale-ai-knee', 'KI_AUTO', 1);

    expect(replaceAutoCuePoints([stale, teacher, demo], [])).toEqual([teacher, demo]);
  });

  it('preserves Nicole-reviewed provenance and replaces only pending AI results', () => {
    const confirmed = cue('confirmed', 'KI_AUTO', 1, 'nicole_confirmed');
    const edited = cue('edited', 'KI_AUTO', 2, 'nicole_edited');
    const rejected = cue('rejected', 'KI_AUTO', 3, 'nicole_rejected');
    const pending = cue('pending', 'KI_AUTO', 4, 'ki_suggestion');
    const generated = cue('new-ai', 'KI_AUTO', 5);

    expect(replaceAutoCuePoints([confirmed, edited, rejected, pending], [generated]))
      .toEqual([confirmed, edited, rejected, generated]);
  });

  it('does not recreate a suggestion at a reviewed or rejected cue position', () => {
    const confirmed = cue('confirmed', 'KI_AUTO', 1, 'nicole_confirmed');
    const rejected = cue('rejected', 'KI_AUTO', 3, 'nicole_rejected');
    const edited = cue('edited', 'TEACHER_CREATED', 4, 'nicole_edited');
    const duplicateConfirmed = cue('regenerated-confirmed', 'KI_AUTO', 1);
    const duplicateRejected = cue('regenerated-rejected', 'KI_AUTO', 3);
    const duplicateEdited = cue('regenerated-edited', 'KI_AUTO', 4);

    expect(replaceAutoCuePoints(
      [confirmed, rejected, edited],
      [duplicateConfirmed, duplicateRejected, duplicateEdited],
    )).toEqual([confirmed, rejected, edited]);
  });
});
