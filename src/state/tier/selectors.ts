/**
 * Tier selectors — the single read seam for the RTK tier slice, scoped through
 * `RootState`.
 *
 * One consolidated module even though there is exactly one selector today: this
 * mirrors the settings slice's `selectors.ts` convention (one read surface per
 * slice the call sites import from), so a second tier selector lands here rather
 * than as a parallel one-function file.
 *
 * `selectTier` is `RootState`-scoped, so the same function drops into BOTH the
 * React side (`useAppSelector(selectTier)`) and the engine side
 * (`selectTier(store.getState())`) unchanged. Because the slice state IS the
 * `Tier` primitive, the selector reads the slice route directly — there is no
 * sub-field to dig into.
 */

import { tierRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { Tier } from '../../@types/data/Tier';

export const selectTier = (state: RootState): Tier => state[tierRoute];
