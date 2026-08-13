// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RealMediaPipePoseService, resolveMediaPipePoseAsset } from '../services/realMediaPipePose';

function createServiceWithResult(result: unknown) {
  const service = new RealMediaPipePoseService();
  let resultHandler: ((value: unknown) => void) | undefined;
  const pose = {
    onResults(handler: (value: unknown) => void) {
      resultHandler = handler;
    },
    async send() {
      resultHandler?.(result);
    },
  };
  Object.assign(service as unknown as Record<string, unknown>, {
    pose,
    isInitialized: true,
  });
  return service;
}

function createServiceWithSendError() {
  const service = new RealMediaPipePoseService();
  const pose = {
    onResults() {},
    async send() {
      throw new Error('inference failed');
    },
  };
  Object.assign(service as unknown as Record<string, unknown>, {
    pose,
    isInitialized: true,
  });
  return service;
}

describe('RealMediaPipePoseService result contract', () => {
  it('resolves every pose dependency from the same-origin packaged asset directory', () => {
    expect(resolveMediaPipePoseAsset('pose_solution_simd_wasm_bin.wasm')).toBe(
      '/mediapipe/wasm/pose_solution_simd_wasm_bin.wasm',
    );
    expect(resolveMediaPipePoseAsset('pose_landmark_full.tflite', '/balletos/')).toBe(
      '/balletos/mediapipe/wasm/pose_landmark_full.tflite',
    );
    expect(() => resolveMediaPipePoseAsset('../remote.js')).toThrow(/Unsupported MediaPipe pose asset path/);
  });

  it('emits explicit empty landmarks when MediaPipe finds no pose', async () => {
    const service = createServiceWithResult({ poseLandmarks: [] });
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const received: unknown[] = [];

    const status = await service.processFrame(canvas, data => received.push(data));

    expect(status).toBe('processed');
    expect(received).toEqual([{ landmarks: [] }]);
  });

  it('emits a valid pose unchanged', async () => {
    const landmarks = Array.from({ length: 33 }, (_, index) => ({
      x: index / 33,
      y: index / 33,
      z: 0,
      visibility: 0.9,
    }));
    const service = createServiceWithResult({ poseLandmarks: landmarks });
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const received: unknown[] = [];

    const status = await service.processFrame(canvas, data => received.push(data));

    expect(status).toBe('processed');
    expect(received).toEqual([{ landmarks, worldLandmarks: undefined }]);
  });

  it('distinguishes busy, unavailable, and inference errors', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;

    const unavailable = new RealMediaPipePoseService();
    expect(await unavailable.processFrame(canvas, () => undefined)).toBe('unavailable');

    const busy = createServiceWithResult({ poseLandmarks: [] });
    Object.assign(busy as unknown as Record<string, unknown>, { isProcessingFrame: true });
    expect(await busy.processFrame(canvas, () => undefined)).toBe('busy');

    const failed = createServiceWithSendError();
    expect(await failed.processFrame(canvas, () => undefined)).toBe('error');
  });
});
