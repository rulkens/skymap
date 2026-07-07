/**
 * galaxySlice — the generator's full knob set, a single Redux slice with ONE
 * write action: `paramsPatched`. Type-button clicks, seed rerolls,
 * randomize-all, preset loads, and fit results all compute a
 * `Partial<GalaxyParams>` and dispatch the same action — there is no bespoke
 * reducer per knob to keep in sync with `GalaxyParams`'s field list, and no
 * way for two write paths to race on the same field.
 *
 * The merge is a shallow `Object.assign` onto the Immer draft: every
 * `GalaxyParams` field is a scalar, so shallow is exactly "patch these
 * fields, leave the rest" — and it makes a type swap plus its stage's knobs
 * (e.g. `type` + `bulgeSize`) land in one atomic dispatch, so no observer
 * ever sees the new type paired with the old bulge size mid-update.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import { DEFAULT_GALAXY_PARAMS } from '../../data/defaultGalaxyParams';

const galaxySlice = createSlice({
  name: 'galaxy',
  initialState: DEFAULT_GALAXY_PARAMS,
  reducers: {
    paramsPatched: (galaxy, action: PayloadAction<Partial<GalaxyParams>>) => {
      Object.assign(galaxy, action.payload);
    },
  },
});

export const { paramsPatched } = galaxySlice.actions;
export default galaxySlice.reducer;
