/**
 * SettingsFragmentLike — the bound every settings derivation quantifies over.
 *
 * No `Cluster` parameter, deliberately: it sits in both a covariant (`seed`) and
 * a contravariant (`reducers`) position, so `LayerSettingsFragment<string,
 * unknown>` is NOT a supertype of a concrete fragment and cannot serve as the
 * bound. The derivations recover the cluster with `infer` instead.
 */

export type SettingsFragmentLike = {
  readonly key: string;
  readonly seed: () => object;
  readonly reducers: object;
};
