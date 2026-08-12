import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameEntry } from '../services/frameInterpolator';
import { vaganovaFrameCache } from '../services/vaganovaFrameCache';
import { vaganovaIdbCache } from '../services/vaganovaIdbCache';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

afterEach(() => {
  vi.restoreAllMocks();
  vaganovaFrameCache.clear('source-a.mp4');
});

describe('VaganovaFrameCache source isolation', () => {
  it('does not publish an IDB result after the selected source changed', async () => {
    const cachedFrames: FrameEntry[] = Array.from({ length: 11 }, (_, index) => ({
      timeMs: index * 100,
      resultKind: 'no_pose' as const,
      landmarks: null,
    }));
    vi.spyOn(vaganovaIdbCache, 'load').mockResolvedValue({
      frames: cachedFrames,
      fps: 30,
      duration: 1,
      vw: 960,
      vh: 1280,
    });
    const onProgress = vi.fn();

    await vaganovaFrameCache.preIndexVideo(
      'source-a.mp4',
      {} as HTMLVideoElement,
      onProgress,
      'source-a-key',
      () => false,
    );

    expect(vaganovaFrameCache.getFrames('source-a.mp4')).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('publishes only the newest scan when the same source is selected again', async () => {
    const firstLoad = deferred<Awaited<ReturnType<typeof vaganovaIdbCache.load>>>();
    const secondLoad = deferred<Awaited<ReturnType<typeof vaganovaIdbCache.load>>>();
    const firstFrames: FrameEntry[] = [{
      timeMs: 0,
      resultKind: 'no_pose',
      landmarks: null,
    }];
    const secondFrames: FrameEntry[] = [{
      timeMs: 100,
      resultKind: 'no_pose',
      landmarks: null,
    }];
    vi.spyOn(vaganovaIdbCache, 'load')
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise);
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();

    const firstScan = vaganovaFrameCache.preIndexVideo(
      'source-a.mp4',
      {} as HTMLVideoElement,
      firstProgress,
      'source-a-key',
      () => true,
    );
    const secondScan = vaganovaFrameCache.preIndexVideo(
      'source-a.mp4',
      {} as HTMLVideoElement,
      secondProgress,
      'source-a-key',
      () => true,
    );

    firstLoad.resolve({
      frames: firstFrames,
      fps: 30,
      duration: 1,
      vw: 960,
      vh: 1280,
    });
    await firstScan;
    expect(vaganovaFrameCache.getFrames('source-a.mp4')).toEqual([]);
    expect(firstProgress).not.toHaveBeenCalled();

    secondLoad.resolve({
      frames: secondFrames,
      fps: 30,
      duration: 1,
      vw: 960,
      vh: 1280,
    });
    await secondScan;

    expect(vaganovaFrameCache.getFrames('source-a.mp4')).toEqual(secondFrames);
    expect(secondProgress).toHaveBeenCalledWith(100, 1, 1, true);
  });
});
