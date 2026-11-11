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
import { sameParamValue } from '../../draft/utils/sameParamValue';
import { setRowParam } from '../../draft/utils/setRowParam';
import { defaultCollapsed } from '../utils/defaultCollapsed';
import { commitDraft } from '../utils/commitDraft';
import { stepHistory } from '../utils/stepHistory';
import { isPickFor } from '../utils/isPickFor';
import { rowKey } from '../../draft/utils/rowKey';
import { ancestorKeys } from '../../draft/utils/ancestorKeys';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { ParamValue } from '../../@types/kinds/ParamValue';
import type { ObjectPick } from '../../@types/session/ObjectPick';
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
        return { ...base, preview: payload.preview, revision, resolution: null, pick: null };
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
    refNamed: (state, { payload }: PayloadAction<{ key: string; name: string }>) => {
      state.refNames[payload.key] = payload.name;
    },
    /** Unfolds the blocks holding the row, so the outline shows it (a waypoint chip picks one inside a folded Fly). */
    rowSelected: (state, { payload }: PayloadAction<RowRef | null>) => {
      // A stored-as-is value, never mutated in place, so re-typing it to Immer's Draft is sound.
      state.selection = payload as Draft<RowRef> | null;
      if (payload !== null && payload.kind !== 'start') {
        const holders = ancestorKeys(payload);
        state.collapsed = state.collapsed.filter((id) => !holders.includes(id));
      }
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
    /** An intent the saga answers with `paramEdited` or `pickFailed`; the field shows it locating. */
    objectPicked: (state, { payload }: PayloadAction<ObjectPick>) => {
      const { ref, param, focusId } = payload;
      state.pick = { row: rowKey(ref), param, focusId, failed: false };
    },
    pickFailed: (state, { payload }: PayloadAction<ObjectPick>) => {
      const { pick } = state;
      if (pick !== null && isPickFor(pick, payload) && pick.focusId === payload.focusId) {
        pick.failed = true;
      }
    },
    paramEdited: (
      state,
      {
        payload,
      }: PayloadAction<{
        ref: RowRef;
        param: string;
        value: ParamValue;
        label: string;
        gesture: string | null;
      }>,
    ) => {
      const before = original(state)!;
      // Any edit of the field settles its pick, the saga's answer included.
      const base =
        before.pick && isPickFor(before.pick, payload) ? { ...before, pick: null } : before;
      if (base.draft === null) return base;
      // Re-committing the value a param already has must not dirty the draft or add an empty Undo.
      if (sameParamValue(rowSubject(base.draft, payload.ref)?.[payload.param], payload.value))
        return base;
      const next = setRowParam(base.draft, payload.ref, payload.param, payload.value);
      return commitDraft({ ...base, draft: base.draft }, next, payload.label, payload.gesture);
    },
    /** Saved pins the view the preview starts from (the camera as the studio opened); live drops it. */
    startModeSet: (state, { payload }: PayloadAction<'saved' | 'live'>) => {
      const base = original(state)!;
      if (base.draft === null || base.preview === null) return;
      if ((typeof base.draft.start === 'object' ? 'saved' : 'live') === payload) return;
      const start = payload === 'saved' ? base.preview.startPose : 'live';
      return commitDraft({ ...base, draft: base.draft }, { ...base.draft, start }, 'Start', null);
    },
    undone: (state) => stepHistory(original(state)!, 'past'),
    redone: (state) => stepHistory(original(state)!, 'future'),
  },
  selectors: {
    selectStudioClipId: (s) => s.clipId,
    selectDraft: (s) => s.draft,
    selectRevision: (s) => s.revision,
    selectSelection: (s) => s.selection,
    selectCollapsed: (s) => s.collapsed,
    selectPlayheadSec: (s) => s.playheadSec,
    selectViewport: (s) => s.viewport,
    selectPreview: (s) => s.preview,
    selectRefNames: (s) => s.refNames,
    selectPick: (s) => s.pick,
    selectIsDirty: (s) => s.draft !== s.baseline,
    selectUndoLabel: (s) => s.history.past.at(-1)?.label ?? null,
    selectRedoLabel: (s) => s.history.future.at(-1)?.label ?? null,
    /** The resolution only when it was made from the current draft revision. */
    selectCurrentResolution: (s): StudioResolution | null =>
      s.resolution?.revision === s.revision ? s.resolution : null,
  },
});

export const {
  studioOpened,
  draftResolved,
  refNamed,
  objectPicked,
  pickFailed,
  rowSelected,
  rowToggled,
  playheadSet,
  viewportSet,
  paramEdited,
  startModeSet,
  undone,
  redone,
} = studioSlice.actions;
