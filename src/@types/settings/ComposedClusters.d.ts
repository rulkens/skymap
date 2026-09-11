/** Each settings fragment's literal `key` mapped to the cluster its `seed` returns. */
// A key that is not a string literal remaps to `never` and drops out — that is what lets a
// fragment-free Layer contribute nothing without a branch.

import type { SettingsFragmentLike } from './SettingsFragmentLike';

type ClusterOf<F> = F extends { readonly seed: () => infer C } ? C : never;

export type ComposedClusters<Fragments extends readonly SettingsFragmentLike[]> = {
  [F in Fragments[number] as F extends { readonly key: infer K extends string }
    ? K
    : never]: ClusterOf<F>;
};
