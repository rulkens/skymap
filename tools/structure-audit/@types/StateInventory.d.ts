import type { StateCount } from './StateCount';
import type { StateSite } from './StateSite';

/** Where mutable state sits outside RTK; every list is a regex heuristic, see README. */
export type StateInventory = {
  readonly moduleLet: readonly StateSite[];
  readonly containers: readonly StateSite[];
  readonly slices: readonly StateSite[];
  readonly classes: readonly StateSite[];
  readonly reactState: readonly StateCount[];
  readonly closure: readonly StateCount[];
};
