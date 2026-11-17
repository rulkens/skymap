import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { ProbeSpheresSettings } from '../../@types/ProbeSpheresSettings';

export const probeSpheresSlice = createSlice({
  name: 'settings/probeSpheres',
  reducerPath: 'probeSpheres',
  initialState,
  reducers: {
    setProbeSpheresMaterial: (
      probeSpheres,
      action: PayloadAction<
        Partial<Pick<ProbeSpheresSettings, 'color' | 'metallic' | 'roughness'>>
      >,
    ) => {
      Object.assign(probeSpheres, action.payload);
    },
  },
});

export const { setProbeSpheresMaterial } = probeSpheresSlice.actions;
