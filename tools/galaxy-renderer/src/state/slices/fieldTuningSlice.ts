/**
 * fieldTuningSlice — the analytic field's warped-ring knobs, mirroring
 * `renderSlice`'s single-action shallow-patch shape. Seeded from
 * `DEFAULT_GALAXY_FIELD_TUNING`, the same constant `buildGalaxyFieldMixture`
 * defaults to when no tuning is supplied — so leaving every slider alone is
 * app parity, not a second copy of the numbers.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { GalaxyFieldTuning } from '../../../../../src/layers/milkyWay/field/mixture/@types/GalaxyFieldTuning';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/layers/milkyWay/field/mixture/utils/galaxyFieldMixture';

const fieldTuningSlice = createSlice({
  name: 'fieldTuning',
  initialState: DEFAULT_GALAXY_FIELD_TUNING,
  reducers: {
    fieldTuningPatched: (tuning, action: PayloadAction<Partial<GalaxyFieldTuning>>) => {
      Object.assign(tuning, action.payload);
    },
  },
});

export const { fieldTuningPatched } = fieldTuningSlice.actions;
export default fieldTuningSlice.reducer;
