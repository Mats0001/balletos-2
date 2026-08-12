// @vitest-environment jsdom
/**
 * useUndoableAnnotations.test.ts
 *
 * Tests for the local undo/redo annotation hook.
 * Covers: undo to empty, redo, hydration, video switching,
 * caption/dataUrl consistency, empty initial state, history limit,
 * and app smoke test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';
import { useUndoableAnnotations } from '../hooks/useUndoableAnnotations';
import type { AnnotationEntry } from '../components/AnnotationLightbox';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnnotationEntry> = {}): AnnotationEntry {
  return {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timeSeconds: 2.16,
    timecodeStr: '00:02.160',
    dataUrl: 'data:image/png;base64,AAAA',
    thumbnailUrl: 'data:image/png;base64,BBBB',
    caption: undefined,
    note: '',
    studentName: 'Emma Berger',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock localStorage with a simple in-memory store that the hook also sees
// ---------------------------------------------------------------------------

let mockStore: Record<string, string> = {};
let mockWrites: Array<{ key: string; value: string }> = [];

beforeEach(() => {
  mockStore = {};
  mockWrites = [];

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStore[key] ?? null,
    setItem: (key: string, value: string) => {
      mockWrites.push({ key, value });
      mockStore[key] = value;
    },
    removeItem: (key: string) => { delete mockStore[key]; },
    clear: () => { mockStore = {}; },
    get length() { return Object.keys(mockStore).length; },
    key: (index: number) => Object.keys(mockStore)[index] ?? null,
  });
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('useUndoableAnnotations', () => {
  // ---- 1. Erste Annotation → Undo zu leer → Redo ----
  it('push → undo to empty → redo restores entry', () => {
    const { result } = renderHook(() => useUndoableAnnotations('video-1'));

    // Start empty
    expect(result.current.entries).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Push one annotation
    const entry = makeEntry({ id: 'a1' });
    act(() => result.current.push([entry]));

    expect(result.current.entries).toEqual([entry]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo → back to empty
    act(() => result.current.undo());

    expect(result.current.entries).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo → entry restored
    act(() => result.current.redo());

    expect(result.current.entries).toEqual([entry]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  // ---- 2. Hydration vorhandener Annotationen ----
  it('hydrates entries from localStorage on mount', () => {
    const existing = [makeEntry({ id: 'h1' }), makeEntry({ id: 'h2' })];
    mockStore['balletos_annotations_video-hydrate'] = JSON.stringify(existing);

    const { result } = renderHook(() =>
      useUndoableAnnotations('video-hydrate'),
    );

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0].id).toBe('h1');
    expect(result.current.entries[1].id).toBe('h2');
  });

  // ---- 3. Wechsel Video A → B → A ohne Vermischung ----
  it('switches videos without mixing annotations', () => {
    const entryA = makeEntry({ id: 'va-1', studentName: 'Video A' });
    const entryB = makeEntry({ id: 'vb-1', studentName: 'Video B' });

    // Start with video A
    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );

    act(() => result.current.push([entryA]));
    expect(result.current.entries).toEqual([entryA]);

    // Switch to video B
    rerender({ videoId: 'videoB' });
    expect(result.current.entries).toEqual([]); // B is empty

    act(() => result.current.push([entryB]));
    expect(result.current.entries).toEqual([entryB]);

    // Switch back to video A
    rerender({ videoId: 'videoA' });
    expect(result.current.entries).toEqual([entryA]);
    expect(result.current.entries[0].studentName).toBe('Video A');
  });

  // ---- 4. Caption/dataUrl bleiben konsistent ----
  it('updateEntry preserves caption and dataUrl through undo/redo', () => {
    const entry = makeEntry({ id: 'c1', caption: 'orig', dataUrl: 'data:old' });

    const { result } = renderHook(() => useUndoableAnnotations('video-cap'));

    act(() => result.current.push([entry]));

    // Update caption
    act(() => result.current.updateEntry('c1', { caption: 'updated caption' }));
    expect(result.current.entries[0].caption).toBe('updated caption');
    expect(result.current.entries[0].dataUrl).toBe('data:old'); // unchanged

    // Update dataUrl
    act(() => result.current.updateEntry('c1', { dataUrl: 'data:new' }));
    expect(result.current.entries[0].dataUrl).toBe('data:new');
    expect(result.current.entries[0].caption).toBe('updated caption'); // still there

    // Undo dataUrl change
    act(() => result.current.undo());
    expect(result.current.entries[0].dataUrl).toBe('data:old');
    expect(result.current.entries[0].caption).toBe('updated caption');

    // Redo dataUrl change
    act(() => result.current.redo());
    expect(result.current.entries[0].dataUrl).toBe('data:new');
  });

  // ---- 5. Empty initial state ----
  it('starts with empty entries when no localStorage data exists', () => {
    const { result } = renderHook(() =>
      useUndoableAnnotations('no-such-video'),
    );

    expect(result.current.entries).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  // ---- 6. Multiple undo/redo cycle ----
  it('handles multi-step undo/redo correctly', () => {
    const e1 = makeEntry({ id: 'm1' });
    const e2 = makeEntry({ id: 'm2' });
    const e3 = makeEntry({ id: 'm3' });

    const { result } = renderHook(() => useUndoableAnnotations('video-multi'));

    act(() => result.current.push([e1]));
    act(() => result.current.push([e1, e2]));
    act(() => result.current.push([e1, e2, e3]));

    // Undo twice → back to [e1]
    act(() => result.current.undo());
    expect(result.current.entries).toEqual([e1, e2]);

    act(() => result.current.undo());
    expect(result.current.entries).toEqual([e1]);

    // Redo once → [e1, e2]
    act(() => result.current.redo());
    expect(result.current.entries).toEqual([e1, e2]);
  });

  // ---- 7. History limit ----
  it('does not exceed history limit of 20', () => {
    const { result } = renderHook(() => useUndoableAnnotations('video-limit'));

    // Push 25 states
    for (let i = 0; i < 25; i++) {
      const entries = Array.from({ length: i + 1 }, (_, j) =>
        makeEntry({ id: `lim-${i}-${j}` }),
      );
      act(() => result.current.push(entries));
    }

    // Undo should be limited: we can undo at most 20 times
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      undoCount++;
      if (undoCount > 25) break; // safety
    }

    expect(undoCount).toBeLessThanOrEqual(20);
  });

  // ---- 8. Provider/App smoke test (no Provider needed!) ----
  it('works without any Provider wrapper', () => {
    // This test proves the hook is self-contained — no React context needed
    const { result } = renderHook(() => useUndoableAnnotations('smoke'));

    expect(result.current.entries).toEqual([]);

    const entry = makeEntry({ id: 'smoke-1' });
    act(() => result.current.push([entry]));
    expect(result.current.entries).toHaveLength(1);

    act(() => result.current.undo());
    expect(result.current.entries).toHaveLength(0);
  });

  // ---- 9. localStorage persistence after push ----
  it('persists entries to localStorage after every mutation', () => {
    const { result } = renderHook(() =>
      useUndoableAnnotations('video-persist'),
    );

    const entry = makeEntry({ id: 'p1' });
    act(() => result.current.push([entry]));

    const stored = JSON.parse(
      mockStore['balletos_annotations_video-persist'] ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('p1');
  });

  it('never writes the outgoing video entries under the incoming key', () => {
    const entryA = makeEntry({ id: 'write-a', studentName: 'Video A' });
    const entryB = makeEntry({ id: 'write-b', studentName: 'Video B' });
    mockStore.balletos_annotations_videoA = JSON.stringify([entryA]);
    mockStore.balletos_annotations_videoB = JSON.stringify([entryB]);

    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );
    expect(result.current.entries).toEqual([entryA]);

    mockWrites = [];
    rerender({ videoId: 'videoB' });

    const writesToB = mockWrites.filter(
      ({ key }) => key === 'balletos_annotations_videoB',
    );
    expect(writesToB.length).toBeGreaterThan(0);
    writesToB.forEach(({ value }) => {
      expect(JSON.parse(value)).toEqual([entryB]);
    });
    expect(result.current.entries).toEqual([entryB]);
    expect(JSON.parse(mockStore.balletos_annotations_videoB)).toEqual([entryB]);
  });

  it('rejects a stale push after switching videos', () => {
    const entryA = makeEntry({ id: 'stale-a' });
    const entryB = makeEntry({ id: 'stable-b' });
    mockStore.balletos_annotations_videoB = JSON.stringify([entryB]);

    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );
    const stalePush = result.current.push;

    rerender({ videoId: 'videoB' });
    let accepted: boolean | undefined;
    act(() => { accepted = stalePush([entryA]); });

    expect(accepted).toBe(false);
    expect(result.current.entries).toEqual([entryB]);
    expect(JSON.parse(mockStore.balletos_annotations_videoB)).toEqual([entryB]);
  });

  it('rejects an old callback after switching away and back to the same video', () => {
    const staleEntryA = makeEntry({ id: 'stale-roundtrip-a' });
    const currentEntryA = makeEntry({ id: 'current-roundtrip-a' });
    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );
    const stalePush = result.current.push;

    rerender({ videoId: 'videoB' });
    rerender({ videoId: 'videoA' });
    act(() => { result.current.push([currentEntryA]); });

    let accepted: boolean | undefined;
    act(() => { accepted = stalePush([staleEntryA]); });

    expect(accepted).toBe(false);
    expect(result.current.entries).toEqual([currentEntryA]);
    expect(JSON.parse(mockStore.balletos_annotations_videoA)).toEqual([currentEntryA]);
  });

  it('accepts the current video push after switching videos', () => {
    const entryB = makeEntry({ id: 'current-b' });
    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );

    rerender({ videoId: 'videoB' });
    let accepted: boolean | undefined;
    act(() => { accepted = result.current.push([entryB]); });

    expect(accepted).toBe(true);
    expect(result.current.entries).toEqual([entryB]);
    expect(JSON.parse(mockStore.balletos_annotations_videoB)).toEqual([entryB]);
  });

  it('ignores stale update, undo, and redo callbacks after a video switch', () => {
    const entryA = makeEntry({ id: 'callback-a', note: 'A' });
    const entryB = makeEntry({ id: 'callback-b', note: 'B' });
    mockStore.balletos_annotations_videoB = JSON.stringify([entryB]);

    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );
    act(() => { result.current.push([entryA]); });
    const staleUpdate = result.current.updateEntry;
    const staleUndo = result.current.undo;
    const staleRedo = result.current.redo;

    rerender({ videoId: 'videoB' });
    act(() => {
      staleUpdate(entryB.id, { note: 'changed by A' });
      staleUndo();
      staleRedo();
    });

    expect(result.current.entries).toEqual([entryB]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(JSON.parse(mockStore.balletos_annotations_videoB)).toEqual([entryB]);
  });

  it('keeps video storage isolated under React StrictMode', () => {
    const entryA = makeEntry({ id: 'strict-a' });
    const entryB = makeEntry({ id: 'strict-b' });
    mockStore.balletos_annotations_videoA = JSON.stringify([entryA]);
    mockStore.balletos_annotations_videoB = JSON.stringify([entryB]);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);

    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' }, wrapper },
    );
    expect(result.current.entries).toEqual([entryA]);

    mockWrites = [];
    rerender({ videoId: 'videoB' });

    expect(result.current.entries).toEqual([entryB]);
    const writesToB = mockWrites.filter(
      ({ key }) => key === 'balletos_annotations_videoB',
    );
    expect(writesToB.length).toBeGreaterThan(0);
    writesToB.forEach(({ value }) => {
      expect(JSON.parse(value)).toEqual([entryB]);
    });
  });

  it('rejects every stale callback across repeated video revisits', () => {
    const currentEntryA = makeEntry({ id: 'multi-current-a' });
    const staleEntries = [
      makeEntry({ id: 'multi-stale-a1' }),
      makeEntry({ id: 'multi-stale-b1' }),
      makeEntry({ id: 'multi-stale-c1' }),
      makeEntry({ id: 'multi-stale-b2' }),
    ];
    const { result, rerender } = renderHook(
      ({ videoId }: { videoId: string }) => useUndoableAnnotations(videoId),
      { initialProps: { videoId: 'videoA' } },
    );
    const stalePushes = [result.current.push];

    rerender({ videoId: 'videoB' });
    stalePushes.push(result.current.push);
    rerender({ videoId: 'videoC' });
    stalePushes.push(result.current.push);
    rerender({ videoId: 'videoB' });
    stalePushes.push(result.current.push);
    rerender({ videoId: 'videoA' });

    let acceptedCurrent: boolean | undefined;
    act(() => { acceptedCurrent = result.current.push([currentEntryA]); });
    expect(acceptedCurrent).toBe(true);

    const staleResults: boolean[] = [];
    stalePushes.forEach((stalePush, index) => {
      act(() => {
        staleResults.push(stalePush([staleEntries[index]]));
      });
    });

    expect(staleResults).toEqual([false, false, false, false]);
    expect(result.current.entries).toEqual([currentEntryA]);
    expect(JSON.parse(mockStore.balletos_annotations_videoA)).toEqual([currentEntryA]);
  });
});
