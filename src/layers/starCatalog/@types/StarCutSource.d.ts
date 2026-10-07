/** A source's GPU cut: the static node table plus its live and capture cuts. */

import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCutState } from './StarCutState';

export type StarCutSource = {
  readonly catalog: StarCatalog;
  readonly nodes: GPUBuffer;
  readonly live: StarCutState;
  /** Built on the first capture: most sessions never bake a sky cubemap. */
  capture: StarCutState | null;
};
