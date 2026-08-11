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

import { useReducer, useCallback, useEffect, useRef } from 'react';
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
  past: AnnotationEntry[][];
  present: AnnotationEntry[];
  future: AnnotationEntry[][];
}

type UndoableAction =
  | { type: 'PUSH'; entries: AnnotationEntry[] }
  | { type: 'UPDATE_ENTRY'; id: string; partial: Partial<AnnotationEntry> }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET'; present: AnnotationEntry[] };

function undoableReducer(
  state: UndoableState,
  action: UndoableAction,
): UndoableState {
  switch (action.type) {
    // ----- Push new entries as present, record history -----
    case 'PUSH': {
      const newPast = [...state.past, state.present].slice(-HISTORY_LIMIT);
      return {
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
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    // ----- Full reset (video switch): load new present, clear history -----
    case 'RESET': {
      return {
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
  /** Replace the entire entry list (records undo history). */
  push: (newEntries: AnnotationEntry[]) => void;
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
  // Track the previous video ID so we can persist before switching.
  const prevVideoIdRef = useRef<string>(stableVideoId);

  // Initialise state lazily from localStorage on first render.
  const [state, dispatch] = useReducer(undoableReducer, stableVideoId, (id) => ({
    past: [],
    present: loadFromStorage(id),
    future: [],
  }));

  // ------ Video ID change: save outgoing, load incoming ------
  useEffect(() => {
    if (prevVideoIdRef.current !== stableVideoId) {
      // Persist the outgoing video's present state.
      saveToStorage(prevVideoIdRef.current, state.present);
      prevVideoIdRef.current = stableVideoId;

      // Load the incoming video's annotations and reset history.
      dispatch({ type: 'RESET', present: loadFromStorage(stableVideoId) });
    }
    // We intentionally depend only on stableVideoId here. Reading
    // state.present inside this effect is safe because the save targets the
    // *previous* video ID, which is only relevant at the moment the ID
    // changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableVideoId]);

  // ------ Persist present to localStorage on every change ------
  useEffect(() => {
    saveToStorage(stableVideoId, state.present);
  }, [stableVideoId, state.present]);

  // ------ Stable callbacks ------

  const push = useCallback((newEntries: AnnotationEntry[]) => {
    dispatch({ type: 'PUSH', entries: newEntries });
  }, []);

  const updateEntry = useCallback(
    (id: string, partial: Partial<AnnotationEntry>) => {
      dispatch({ type: 'UPDATE_ENTRY', id, partial });
    },
    [],
  );

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

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
