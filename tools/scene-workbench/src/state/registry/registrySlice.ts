import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { GroupRegistryEntry } from '../../../@types/GroupRegistryEntry';

/** RegistrySlice — the group picker's list and its fetch status. `groupSelected`
 *  is owned here (the picker's own action) but `groupSlice` reacts to it via
 *  `extraReducers` to clear the previous group's manifest. */
export type RegistrySlice = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  groups: readonly GroupRegistryEntry[];
  selectedGroupId: string | null;
  error: string | null;
};

export const defaultRegistrySlice: RegistrySlice = {
  status: 'idle',
  groups: [],
  selectedGroupId: null,
  error: null,
};

export const registrySlice = createSlice({
  name: 'registry',
  initialState: defaultRegistrySlice,
  reducers: {
    registryLoading: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    registryLoaded: (state, action: PayloadAction<readonly GroupRegistryEntry[]>) => {
      state.status = 'ready';
      state.groups = action.payload as Draft<GroupRegistryEntry[]>;
    },
    registryFailed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    groupSelected: (state, action: PayloadAction<string>) => {
      state.selectedGroupId = action.payload;
    },
  },
});

export const { registryLoading, registryLoaded, registryFailed, groupSelected } =
  registrySlice.actions;
