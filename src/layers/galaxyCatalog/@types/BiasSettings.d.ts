/**
 * BiasSettings — the user-tunable half of the Malmquist-bias correction. The
 * bake-derived weights live on `state.bias` (worker outputs), not here.
 */

import type { BiasMode } from './BiasMode';

export type BiasSettings = {
  mode: BiasMode;
  absMagLimit: number;
};
