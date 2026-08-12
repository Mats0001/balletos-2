import { describe, expect, it } from 'vitest';
import { PoseLandmark } from '../services/realMediaPipePose';
import { VaganovaAngleCalculator } from '../services/vaganovaAngleCalculator';

function validLandmarks(): PoseLandmark[] {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));
  const set = (index: number, x: number, y: number) => {
    points[index] = { x, y, z: 0, visibility: 0.95 };
  };
  set(0, 0.5, 0.2);
  set(7, 0.46, 0.22);
  set(8, 0.54, 0.22);
  set(11, 0.4, 0.35);
  set(12, 0.6, 0.35);
  set(13, 0.3, 0.45);
  set(14, 0.7, 0.45);
  set(15, 0.2, 0.4);
  set(16, 0.8, 0.4);
  set(23, 0.44, 0.58);
  set(24, 0.56, 0.58);
  set(25, 0.42, 0.72);
  set(26, 0.58, 0.72);
  set(27, 0.4, 0.88);
  set(28, 0.6, 0.88);
  set(29, 0.38, 0.89);
  set(30, 0.62, 0.89);
  set(31, 0.32, 0.9);
  set(32, 0.68, 0.9);
  return points;
}

describe('VaganovaAngleCalculator evidence validation', () => {
  it('returns measurable finite observations for valid non-degenerate geometry', () => {
    const calculator = new VaganovaAngleCalculator();
    const result = calculator.analyzeFullFrame(validLandmarks(), 960, 1280);

    expect(result.spineTilt?.value).toSatisfy(Number.isFinite);
    expect(result.pelvicTilt?.value).toSatisfy(Number.isFinite);
    expect(result.shoulderSymmetry?.value).toSatisfy(Number.isFinite);
    expect(result.armLineQualityL?.value).toSatisfy(Number.isFinite);
    expect(result.headTilt?.value).toSatisfy(Number.isFinite);
  });

  it('rejects non-finite landmark coordinates instead of emitting colored evidence', () => {
    const points = validLandmarks();
    points[11] = { ...points[11], x: Number.NaN };
    const result = new VaganovaAngleCalculator().analyzeFullFrame(points, 960, 1280);

    expect(result.spineTilt).toBeNull();
    expect(result.shoulderSymmetry).toBeNull();
    expect(result.armLineQualityL).toBeNull();
  });

  it('rejects collapsed axes and joint segments', () => {
    const points = validLandmarks();
    points[11] = { ...points[11], x: 0.5, y: 0.5 };
    points[12] = { ...points[12], x: 0.5, y: 0.5 };
    points[13] = { ...points[13], x: 0.5, y: 0.5 };
    points[15] = { ...points[15], x: 0.5, y: 0.5 };
    points[23] = { ...points[23], x: 0.5, y: 0.5 };
    points[24] = { ...points[24], x: 0.5, y: 0.5 };
    points[25] = { ...points[25], x: 0.5, y: 0.5 };
    points[27] = { ...points[27], x: 0.5, y: 0.5 };
    const result = new VaganovaAngleCalculator().analyzeFullFrame(points, 960, 1280);

    expect(result.spineTilt).toBeNull();
    expect(result.pelvicTilt).toBeNull();
    expect(result.shoulderSymmetry).toBeNull();
    expect(result.armLineQualityL).toBeNull();
    expect(result.knieFlexionL).toBeNull();
    expect(result.valgusDriftL).toBeNull();
  });

  it('rejects invalid or insufficient landmark visibility', () => {
    for (const visibility of [0.2, Number.NaN, -0.1, 1.1]) {
      const points = validLandmarks();
      points[11] = { ...points[11], visibility };
      const result = new VaganovaAngleCalculator().analyzeFullFrame(points, 960, 1280);

      expect(result.spineTilt).toBeNull();
      expect(result.shoulderSymmetry).toBeNull();
      expect(result.armLineQualityL).toBeNull();
    }
  });

  it('rejects either collapsed nose-to-ear segment symmetrically', () => {
    for (const earIndex of [7, 8]) {
      const points = validLandmarks();
      points[earIndex] = { ...points[earIndex], x: points[0].x, y: points[0].y };

      expect(
        new VaganovaAngleCalculator().analyzeFullFrame(points, 960, 1280).epaulement,
      ).toBeNull();
    }
  });
});
