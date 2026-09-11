import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { liftClusterReducers } from '../../../src/utils/settings/liftClusterReducers';
import type { LayerSettingsFragment } from '../../../src/@types/settings/LayerSettingsFragment';

type AlphaCluster = { n: number };
type Root = { alpha: AlphaCluster; beta: { s: string } };

const seedRoot = (): Root => ({ alpha: { n: 1 }, beta: { s: 'x' } });

const alpha = {
  key: 'alpha',
  seed: (): AlphaCluster => ({ n: 1 }),
  reducers: {
    setN: (cluster: AlphaCluster, action: PayloadAction<number>) => {
      cluster.n = action.payload;
    },
    // Mutating and returning are both legal in RTK; `mergeSnapshot` is the returning kind.
    resetN: (cluster: AlphaCluster, action: PayloadAction<number>): AlphaCluster => ({
      n: cluster.n + action.payload,
    }),
  },
} satisfies LayerSettingsFragment<'alpha', AlphaCluster>;

describe('liftClusterReducers', () => {
  // Driven through a real createSlice: the lift has to resolve its cluster off the live
  // Immer draft, and a bare object reducer call would not reach a draft-projection bug.
  const slice = createSlice({
    name: 'settings',
    initialState: seedRoot,
    reducers: { ...liftClusterReducers<Root, typeof alpha>(alpha) },
  });

  it('rebases a case reducer onto its cluster', () => {
    const before = slice.getInitialState();
    const after = slice.reducer(before, slice.actions.setN(7));

    expect(after.alpha.n).toBe(7);
    expect(after.beta).toBe(before.beta);
  });

  it('a returning case reducer replaces the cluster', () => {
    const before = slice.getInitialState();
    const after = slice.reducer(before, slice.actions.resetN(4));

    expect(after.alpha).toEqual({ n: 5 });
    expect(after.beta).toBe(before.beta);
  });

  it('throws on a { reducer, prepare } case reducer', () => {
    const prepared = {
      key: 'alpha',
      seed: (): AlphaCluster => ({ n: 1 }),
      reducers: {
        bumpN: {
          reducer: (cluster: AlphaCluster, action: PayloadAction<number>) => {
            cluster.n += action.payload;
          },
          prepare: (n: number) => ({ payload: n }),
        },
      },
    } satisfies LayerSettingsFragment<'alpha', AlphaCluster>;

    const lift = () => liftClusterReducers<Root, typeof prepared>(prepared);

    expect(lift).toThrow(/bumpN/);
    expect(lift).toThrow(/alpha/);
  });
});
