import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { liftClusterReducers } from '../../../src/utils/settings/liftClusterReducers';
import type { LayerSettingsFragment } from '../../../src/@types/settings/LayerSettingsFragment';

type AlphaCluster = { n: number };
type Root = { alpha: AlphaCluster; beta: { s: string } };

const alpha = {
  key: 'alpha',
  seed: (): AlphaCluster => ({ n: 1 }),
  reducers: {
    setN: (cluster: AlphaCluster, action: PayloadAction<number>) => {
      cluster.n = action.payload;
    },
  },
} satisfies LayerSettingsFragment<'alpha', AlphaCluster>;

describe('liftClusterReducers', () => {
  // Driven through a real createSlice: the lift has to resolve its cluster off the live
  // Immer draft, and a bare object reducer call would not reach a draft-projection bug.
  it('rebases a case reducer onto its cluster', () => {
    const slice = createSlice({
      name: 'settings',
      initialState: (): Root => ({ alpha: { n: 1 }, beta: { s: 'x' } }),
      reducers: { ...liftClusterReducers<Root, typeof alpha>(alpha) },
    });

    const before = slice.getInitialState();
    const after = slice.reducer(before, slice.actions.setN(7));

    expect(after.alpha.n).toBe(7);
    expect(after.beta).toBe(before.beta);
  });
});
