/**
 * The studio's read seam over the app's `RootState`, which does not know the injected slice: until
 * the slice's first action lands its key is absent and every selector reads `initialState`, as RTK's
 * `injectInto` selectors do. Typed over `RootState` so components read them with `useAppSelector`.
 */
import { studioSlice } from './studioSlice';
import { initialState } from './initialState';
import type { RootState } from '../../../../../src/store/types';
import type { StudioResolution } from '../../@types/session/StudioResolution';
import type { StudioState } from '../../@types/session/StudioState';

export const selectStudioState = (state: RootState): StudioState => {
  const withStudio: RootState & { readonly [studioSlice.reducerPath]?: StudioState } = state;
  return withStudio[studioSlice.reducerPath] ?? initialState;
};

const select =
  <T>(read: (studio: StudioState) => T) =>
  (state: RootState): T =>
    read(selectStudioState(state));

export const selectStudioClipId = select((s) => s.clipId);
export const selectDraft = select((s) => s.draft);
export const selectRevision = select((s) => s.revision);
export const selectSelection = select((s) => s.selection);
export const selectCollapsed = select((s) => s.collapsed);
export const selectPlayheadSec = select((s) => s.playheadSec);
export const selectViewport = select((s) => s.viewport);
export const selectPreview = select((s) => s.preview);
export const selectIsDirty = select((s) => s.draft !== s.baseline);
export const selectUndoLabel = select((s) => s.history.past.at(-1)?.label ?? null);
export const selectRedoLabel = select((s) => s.history.future.at(-1)?.label ?? null);
/** The resolution only when it was made from the current draft revision. */
export const selectCurrentResolution = select((s): StudioResolution | null =>
  s.resolution?.revision === s.revision ? s.resolution : null,
);
