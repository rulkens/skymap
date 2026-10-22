import type { BiasWeightKind } from './BiasWeightKind';

export type GladeOctreeOptions = {
  readonly outDir: string;
  readonly biasWeight: BiasWeightKind;
  /** Every pgc that has a name in `pgc_aliases.json`; the bake keeps those GLADE has. */
  readonly aliasPgcs: readonly number[];
};
