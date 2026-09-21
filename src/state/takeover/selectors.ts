/**
 * Takeover selectors — the read seam for the `takeover` slice: which source,
 * if any, currently owns the scene. `selectTourActive` (tour/selectors.ts)
 * derives from `selectTakeoverSource` rather than duplicating this read.
 */

import { takeoverRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export const selectTakeoverSource = (state: RootState): TakeoverSource | null =>
  state[takeoverRoute].active;

export const selectTakeoverActive = (state: RootState): boolean =>
  selectTakeoverSource(state) !== null;
