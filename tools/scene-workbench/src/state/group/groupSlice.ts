import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import { groupSelected } from '../registry/registrySlice';
import type { SceneManifest } from '../../../@types/SceneManifest';

export type AssetStatus = 'pending' | 'ready' | 'error';

/** GroupSlice — the selected group's manifest and per-asset load status. */
export type GroupSlice = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  manifest: SceneManifest | null;
  assetStatus: Record<string, AssetStatus>;
  error: string | null;
};

export const defaultGroupSlice: GroupSlice = {
  status: 'idle',
  manifest: null,
  assetStatus: {},
  error: null,
};

export const groupSlice = createSlice({
  name: 'group',
  initialState: defaultGroupSlice,
  reducers: {
    manifestLoaded: (state, action: PayloadAction<SceneManifest>) => {
      state.status = 'ready';
      state.manifest = action.payload as Draft<SceneManifest>;
      state.error = null;
    },
    manifestFailed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    assetStatusChanged: (
      state,
      action: PayloadAction<{ assetId: string; status: AssetStatus }>,
    ) => {
      state.assetStatus[action.payload.assetId] = action.payload.status;
    },
  },
  extraReducers: (builder) => {
    // A same-named `groupSelected` reducer in the `reducers` block above would
    // create a second action type and silently drop the registry's — RTK
    // orders `finalCaseReducers` with `reducers` last, so an `extraReducers`
    // case for an own action type is dropped without warning.
    builder.addCase(groupSelected, (state) => {
      state.status = 'idle';
      state.manifest = null;
      state.assetStatus = {};
      state.error = null;
    });
  },
});

export const { manifestLoaded, manifestFailed, assetStatusChanged } = groupSlice.actions;
