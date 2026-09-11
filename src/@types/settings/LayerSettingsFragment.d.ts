/**
 * LayerSettingsFragment — one settings cluster a Layer owns: where it sits in
 * the settings tree (`key`), its seeded default, and the reducers that write it.
 */

import type { SliceCaseReducers } from '@reduxjs/toolkit';

export type LayerSettingsFragment<Key extends string, Cluster> = {
  readonly key: Key;
  readonly seed: () => Cluster;
  /** Over this cluster alone; `liftClusterReducers` re-bases them on the root. */
  readonly reducers: SliceCaseReducers<Cluster>;
};
