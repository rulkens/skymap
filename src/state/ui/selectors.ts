/**
 * UI selectors — the single read seam for the RTK ui slice, scoped through
 * `RootState`.
 *
 * One module, not one-file-per-selector: this is the spec's explicit override
 * of the repo's one-function-per-file rule, so the whole ui read surface lives
 * in one place that call sites import from.
 *
 * The shape mirrors the settings selectors' base + leaf pattern:
 *
 *  - `selectUi` is the private base selector — it lifts the ui slice out of
 *    `RootState` via `state[uiRoute]`, naming the route exactly once. Every
 *    leaf composes through it.
 *  - The leaf selectors are plain composed arrows. These are all primitive or
 *    primitive-nested reads; `useSelector`'s reference-equality check already
 *    bails out on identical values, so wrapping them in `createSelector` would
 *    add a memo layer that buys nothing.
 *
 * Every selector is `RootState`-scoped so the same function works unchanged on
 * BOTH the React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`).
 */

import { uiRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { UiState } from '../../@types/ui/UiState';

const selectUi = (state: RootState): UiState => state[uiRoute];

export const selectPaletteOpen = (state: RootState): boolean => selectUi(state).paletteOpen;

export const selectUiHidden = (state: RootState): boolean => selectUi(state).uiHidden;

export const selectDebugPanelOpen = (state: RootState): boolean => selectUi(state).debugPanelOpen;

export const selectSplashVisible = (state: RootState): boolean => selectUi(state).splash.visible;

export const selectSplashDismissedVersion = (state: RootState): number | null =>
  selectUi(state).splash.dismissedVersion;
