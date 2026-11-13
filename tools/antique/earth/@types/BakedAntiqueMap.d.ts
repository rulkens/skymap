import type { BakedFill } from './BakedFill';
import type { BakedStrip } from './BakedStrip';
import type { BakedSign } from './BakedSign';

/** Everything `encodeAntiqueEarthMap` writes into `public/antique/earth-1690.bin`.
 * Signs are in painter order: the runtime draws them as given. */
export type BakedAntiqueMap = {
  readonly fill: BakedFill;
  readonly strips: readonly BakedStrip[];
  readonly signs: readonly BakedSign[];
};
