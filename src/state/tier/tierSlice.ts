/**
 * tierSlice — the data-resolution preset (`small | medium | large`) promoted out
 * of the settings slice into its own root slice.
 *
 * Why a slice of its own rather than the `tier` field that used to hang off the
 * settings state: tier is the data-loading budget, not a render knob. Folding it
 * into `settings` meant a settings restore — a tour storyboard laying down a
 * `SettingsSnapshot`, or any future "reset to defaults" — could sweep the tier
 * back to its baked-in `medium` as a side effect of touching unrelated knobs.
 * Lifting it to a sibling root slice un-braids the two concerns: a settings
 * merge can no longer reach the tier, and the only path that changes it is the
 * explicit `setTier` write (driven by the tier saga in a later task).
 *
 * The slice state IS the `Tier` primitive — there is no wrapper object, because
 * there is exactly one value to hold. That makes `setTier` a RETURNING reducer
 * rather than the mutate-the-draft style the settings slice uses: a primitive
 * draft cannot be mutated in place (you can't reassign the draft `tier` itself),
 * so the reducer returns the new tier as the replacement state. RTK accepts a
 * returned value as the next state, exactly as it does for the settings slice's
 * one returning reducer (`mergeSnapshot`).
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Tier } from '../../@types/data/Tier';

const tierSlice = createSlice({
  name: 'tier',
  // 'medium' is the ~600k-galaxy desktop budget — the engine's boot default,
  // the same seed the settings slice used before tier moved out.
  initialState: 'medium' as Tier,
  reducers: {
    // Returning reducer: the state is a primitive, so we hand back the payload
    // as the next tier rather than mutating an (unmutatable) primitive draft.
    setTier: (tier, action: PayloadAction<Tier>) => action.payload,
  },
});

export const { setTier } = tierSlice.actions;

export default tierSlice.reducer;
