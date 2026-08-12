/**
 * useUndoableAnnotations.ts
 *
 * A pure-local undo/redo hook for annotation entries, scoped per video.
 * Replaces the Redux-based annotation undo/redo with a self-contained
 * approach that persists to localStorage keyed by stable video ID.
 *
 * State model:
 *   past:    AnnotationEntry[][]   – stack of previous states (max 20)
 *   present: AnnotationEntry[]     – current annotations
 *   future:  AnnotationEntry[][]   – stack of undone states
 *
 * Returned API:
 *   entries      – the current annotation entries (present)
 *   push         – replace present with new entries, record history
 *   updateEntry  – patch a single entry by id (note, caption, dataUrl, etc.)
 *   undo / redo  – navigate history
 *   canUndo      – true when past is non-empty
 *   canRedo      – true when future is non-empty
 */

import { useReducer, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { AnnotationEntry } from '../components/AnnotationLightbox';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of undo steps retained. */
const HISTORY_LIMIT = 20;

/** Prefix for localStorage keys. */
const STORAGE_KEY_PREFIX = 'balletos_annotations_';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(videoId: string): string {
  return `${STORAGE_KEY_PREFIX}${videoId}`;
}

/** Safely read annotation entries from localStorage. Returns [] on failure. */
function loadFromStorage(videoId: string): AnnotationEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(videoId));
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist annotation entries to localStorage. Silently swallows errors. */
function saveToStorage(videoId: string, entries: AnnotationEntry[]): void {
  try {
    localStorage.setItem(storageKey(videoId), JSON.stringify(entries));
  } catch {
    // Storage full or unavailable – degrade gracefully.
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

interface UndoableState {
  videoId: string;
  generation: number;
  past: AnnotationEntry[][];
  present: AnnotationEntry[];
  future: AnnotationEntry[][];
}

type UndoableAction =
  | { type: 'PUSH'; videoId: string; generation: number; entries: AnnotationEntry[] }
  | { type: 'UPDATE_ENTRY'; videoId: string; generation: number; id: string; partial: Partial<AnnotationEntry> }
  | { type: 'UNDO'; videoId: string; generation: number }
  | { type: 'REDO'; videoId: string; generation: number }
  | { type: 'RESET'; videoId: string; generation: number; present: AnnotationEntry[] };

function undoableReducer(
  state: UndoableState,
  action: UndoableAction,
): UndoableState {
  if (
    action.type !== 'RESET'
    && (action.videoId !== state.videoId || action.generation !== state.generation)
  ) {
    return state;
  }

  switch (action.type) {
    // ----- Push new entries as present, record history -----
    case 'PUSH': {
      const newPast = [...state.past, state.present].slice(-HISTORY_LIMIT);
      return {
        videoId: state.videoId,
        generation: state.generation,
        past: newPast,
        present: action.entries,
        future: [],
      };
    }

    // ----- Update a single entry in-place, record history -----
    case 'UPDATE_ENTRY': {
      const idx = state.present.findIndex((e) => e.id === action.id);
      if (idx === -1) return state; // Entry not found – no-op.

      const updated = [
        ...state.present.slice(0, idx),
        { ...state.present[idx], ...action.partial },
        ...state.present.slice(idx + 1),
      ];

      const newPast = [...state.past, state.present].slice(-HISTORY_LIMIT);
      return {
        videoId: state.videoId,
        generation: state.generation,
        past: newPast,
        present: updated,
        future: [],
      };
    }

    // ----- Undo: pop from past, push present onto future -----
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        videoId: state.videoId,
        generation: state.generation,
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    // ----- Redo: pop from future, push present onto past -----
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        videoId: state.videoId,
        generation: state.generation,
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    // ----- Full reset (video switch): load new present, clear history -----
    case 'RESET': {
      return {
        videoId: action.videoId,
        generation: action.generation,
        past: [],
        present: action.present,
        future: [],
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseUndoableAnnotationsResult {
  /** Current annotation entries. */
  entries: AnnotationEntry[];
  /** Replace the entire entry list (records undo history when the video is still active). */
  push: (newEntries: AnnotationEntry[]) => boolean;
  /** Patch a single entry by id (records undo history). */
  updateEntry: (id: string, partial: Partial<AnnotationEntry>) => void;
  /** Step backward in history. */
  undo: () => void;
  /** Step forward in history. */
  redo: () => void;
  /** Whether an undo step is available. */
  canUndo: boolean;
  /** Whether a redo step is available. */
  canRedo: boolean;
}

/**
 * Manages annotation entries with full undo/redo support, scoped to a single
 * video identified by `stableVideoId`. State is persisted to localStorage on
 * every change and rehydrated on mount or when the video ID changes.
 *
 * @param stableVideoId – A stable, unique identifier for the video whose
 *   annotations are being managed. Changing this value saves the current
 *   state and loads the new video's annotations (with a fresh history).
 */
export function useUndoableAnnotations(
  stableVideoId: string,
): UseUndoableAnnotationsResult {
  const activeScopeRef = useRef({ videoId: stableVideoId, generation: 0 });

  // Initialise state lazily from localStorage on first render.
  const [state, dispatch] = useReducer(undoableReducer, stableVideoId, (id) => ({
    videoId: id,
    generation: 0,
    past: [],
    present: loadFromStorage(id),
    future: [],
  }));

  // ------ Video ID change: save outgoing, load incoming ------
  useLayoutEffect(() => {
    if (state.videoId !== stableVideoId) {
      saveToStorage(state.videoId, state.present);
      const nextGeneration = activeScopeRef.current.generation + 1;
      activeScopeRef.current = {
        videoId: stableVideoId,
        generation: nextGeneration,
      };
      dispatch({
        type: 'RESET',
        videoId: stableVideoId,
        generation: nextGeneration,
        present: loadFromStorage(stableVideoId),
      });
      return;
    }

    activeScopeRef.current = {
      videoId: state.videoId,
      generation: state.generation,
    };
  }, [stableVideoId, state.videoId, state.generation, state.present]);

  // ------ Persist present to localStorage on every change ------
  useEffect(() => {
    saveToStorage(state.videoId, state.present);
  }, [state.videoId, state.present]);

  // ------ Stable callbacks ------

  const push = useCallback((newEntries: AnnotationEntry[]) => {
    if (
      activeScopeRef.current.videoId !== state.videoId
      || activeScopeRef.current.generation !== state.generation
    ) return false;
    dispatch({
      type: 'PUSH',
      videoId: state.videoId,
      generation: state.generation,
      entries: newEntries,
    });
    return true;
  }, [state.videoId, state.generation]);

  const updateEntry = useCallback(
    (id: string, partial: Partial<AnnotationEntry>) => {
      if (
        activeScopeRef.current.videoId !== state.videoId
        || activeScopeRef.current.generation !== state.generation
      ) return;
      dispatch({
        type: 'UPDATE_ENTRY',
        videoId: state.videoId,
        generation: state.generation,
        id,
        partial,
      });
    },
    [state.videoId, state.generation],
  );

  const undo = useCallback(() => {
    if (
      activeScopeRef.current.videoId !== state.videoId
      || activeScopeRef.current.generation !== state.generation
    ) return;
    dispatch({
      type: 'UNDO',
      videoId: state.videoId,
      generation: state.generation,
    });
  }, [state.videoId, state.generation]);

  const redo = useCallback(() => {
    if (
      activeScopeRef.current.videoId !== state.videoId
      || activeScopeRef.current.generation !== state.generation
    ) return;
    dispatch({
      type: 'REDO',
      videoId: state.videoId,
      generation: state.generation,
    });
  }, [state.videoId, state.generation]);

  return {
    entries: state.present,
    push,
    updateEntry,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
