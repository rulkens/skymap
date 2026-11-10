import { describe, it, expect } from 'vitest';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { createAppStore } from '../../src/store/createAppStore';
import { rootReducer } from '../../src/store/rootReducer';
import type { RootState } from '../../src/store/types';

const probeSlice = createSlice({
  name: 'rootReducerProbe',
  initialState: { count: 3 },
  reducers: {
    added: (state, action: PayloadAction<number>) => {
      state.count += action.payload;
    },
  },
});

describe('rootReducer', () => {
  it('a slice injected after store creation reads initialState before its first action and its own state after', () => {
    const { store } = createAppStore();
    const injected = probeSlice.injectInto(rootReducer);
    // The app's RootState has no probe route; a lazy slice widens it with its own optional key.
    const select = (): { count: number } => {
      const state: RootState & { rootReducerProbe?: { count: number } } = store.getState();
      return injected.selectSlice(state);
    };

    expect(select()).toEqual({ count: 3 });

    store.dispatch(injected.actions.added(4));
    expect(select()).toEqual({ count: 7 });
  });
});
