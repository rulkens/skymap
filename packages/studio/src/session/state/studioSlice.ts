/**
 * studioSlice — the studio's one state home, injected into the app's root reducer (ADR 0016).
 * History reducers work on `original(state)`, the plain base, so drafts keep their identity:
 * undoing to the opened draft restores the baseline object itself, which is how clean is detected.
 * `revision` bumps whenever the resolved form could change (an edit, undo, redo, an open with new
 * preview pins); `draftResolved` only lands for the current revision (A6).
 */
import { createSlice, original, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import { rowSubject } from '../../draft/utils/rowSubject';
import { setRowParam } from '../../draft/utils/setRowParam';
import { defaultCollapsed } from '../utils/defaultCollapsed';
import { stepHistory } from '../utils/stepHistory';
import { HISTORY_LIMIT } from '../data/studioLimits';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { RowRef } from '../../@types/rows/RowRef';
import type { PreviewPins } from '../../@types/session/PreviewPins';
import type { StudioResolution } from '../../@types/session/StudioResolution';
import type { TimeWindow } from '../../@types/session/TimeWindow';

export const studioSlice = createSlice({
  name: 'studio',
  initialState,
  reducers: {
    studioOpened: (
      state,
      { payload }: PayloadAction<{ clipId: ClipId; draft: ClipData; preview: PreviewPins }>,
    ) => {
      const base = original(state)!;
      const revision = base.revision + 1;
      // Q28: an unsaved draft survives Close and reopening the same clip.
      if (base.clipId === payload.clipId && base.draft !== base.baseline) {
        return { ...base, preview: payload.preview, revision, resolution: null };
      }
      return {
        ...initialState,
        clipId: payload.clipId,
        baseline: payload.draft,
        draft: payload.draft,
        revision,
        preview: payload.preview,
        collapsed: defaultCollapsed(payload.draft),
      };
    },
    draftResolved: (state, { payload }: PayloadAction<StudioResolution>) => {
      if (payload.revision === state.revision) state.resolution = payload;
    },
    rowSelected: (state, { payload }: PayloadAction<RowRef | null>) => {
      // A stored-as-is value, never mutated in place, so re-typing it to Immer's Draft is sound.
      state.selection = payload as Draft<RowRef> | null;
    },
    rowToggled: (state, { payload }: PayloadAction<string>) => {
      const { collapsed } = state;
      state.collapsed = collapsed.includes(payload)
        ? collapsed.filter((id) => id !== payload)
        : [...collapsed, payload];
    },
    playheadSet: (state, { payload }: PayloadAction<number>) => {
      state.playheadSec = Math.max(0, payload);
    },
    viewportSet: (state, { payload }: PayloadAction<TimeWindow | null>) => {
      state.viewport = payload;
    },
    paramEdited: (
      state,
      {
        payload,
      }: PayloadAction<{
        ref: RowRef;
        param: string;
        value: number | string | boolean | undefined;
        label: string;
        gesture: string | null;
      }>,
    ) => {
      const base = original(state)!;
      if (base.draft === null) return;
      // Re-committing the value a param already has must not dirty the draft or add an empty Undo.
      if (Object.is(rowSubject(base.draft, payload.ref)?.[payload.param], payload.value)) return;
      const { past } = base.history;
      const top = past.at(-1);
      const coalesce = payload.gesture !== null && top?.gesture === payload.gesture;
      const entry = { draft: base.draft, label: payload.label, gesture: payload.gesture };
      return {
        ...base,
        draft: setRowParam(base.draft, payload.ref, payload.param, payload.value),
        revision: base.revision + 1,
        history: {
          past: coalesce ? past : [...past, entry].slice(-HISTORY_LIMIT),
          future: [],
        },
      };
    },
    undone: (state) => stepHistory(original(state)!, 'past'),
    redone: (state) => stepHistory(original(state)!, 'future'),
  },
});

export const {
  studioOpened,
  draftResolved,
  rowSelected,
  rowToggled,
  playheadSet,
  viewportSet,
  paramEdited,
  undone,
  redone,
} = studioSlice.actions;
