/**
 * The studio's read seam: the slice's own selectors over the app's `RootState`, through
 * `injectInto` (ADR 0016, plan A3). Importing this module injects the slice; until its first action
 * lands, its key is absent and RTK's `selectSlice` reads `initialState`. `RootState` does not name
 * the injected key, so `selectStudioState` widens it once and every other selector builds on it.
 */
import { studioSlice } from './studioSlice';
import { rootReducer } from '../../../../../src/store/rootReducer';
import type { RootState } from '../../../../../src/store/types';
import type { StudioState } from '../../@types/session/StudioState';

const studio = studioSlice.injectInto(rootReducer);

export const selectStudioState = (state: RootState): StudioState => {
  const withStudio: RootState & { readonly [studio.reducerPath]?: StudioState } = state;
  return studio.selectSlice(withStudio);
};

export const {
  selectStudioClipId,
  selectDraft,
  selectRevision,
  selectSelection,
  selectCollapsed,
  selectPlayheadSec,
  selectViewport,
  selectPreview,
  selectRefNames,
  selectIsDirty,
  selectUndoLabel,
  selectRedoLabel,
  selectCurrentResolution,
} = studio.getSelectors(selectStudioState);
