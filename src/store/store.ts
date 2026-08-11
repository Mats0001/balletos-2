// src/store/store.ts
import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AnnotationEntry } from '../components/AnnotationLightbox';

// ---------- UI Slice (activeTool) ----------
export type Tool = 'pan' | 'select' | 'draw' | 'erase' | 'marker' | 'comment';
const uiSlice = createSlice({
  name: 'ui',
  initialState: { activeTool: 'pan' as Tool },
  reducers: {
    setActiveTool(state, action: PayloadAction<Tool>) {
      state.activeTool = action.payload;
    },
  },
});
export const { setActiveTool } = uiSlice.actions;

// ---------- Annotation History Slice ----------
export interface AnnotationHistoryState {
  past: AnnotationEntry[][]; // older states
  present: AnnotationEntry[]; // current state
  future: AnnotationEntry[][]; // undone states
  limit: number; // max entries stored in past
}
const initialHistory: AnnotationHistoryState = {
  past: [],
  present: [],
  future: [],
  limit: 20,
};
const historySlice = createSlice({
  name: 'annotationHistory',
  initialState: initialHistory,
  reducers: {
    setPresent(state, action: PayloadAction<AnnotationEntry[]>) {
      state.present = action.payload;
    },
    push(state, action: PayloadAction<AnnotationEntry[]>) {
      // push current present onto past, then set new present
      if (state.present.length) {
        state.past.push(state.present);
        if (state.past.length > state.limit) state.past.shift();
      }
      state.present = action.payload;
      state.future = [];
    },
    undo(state) {
      if (state.past.length === 0) return;
      const previous = state.past.pop() as AnnotationEntry[];
      state.future.unshift(state.present);
      state.present = previous;
    },
    redo(state) {
      if (state.future.length === 0) return;
      const next = state.future.shift() as AnnotationEntry[];
      state.past.push(state.present);
      state.present = next;
    },
    clearHistory(state) {
      state.past = [];
      state.future = [];
    },
  },
});
export const { push, undo, redo, clearHistory, setPresent } = historySlice.actions;

export const store = configureStore({
  reducer: {
    ui: uiSlice.reducer,
    annotationHistory: historySlice.reducer,
  },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
