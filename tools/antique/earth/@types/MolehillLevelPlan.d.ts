import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds';

/** One level of molehill placement: the height-lattice level its heights are
 * read at, and the box its new hills may land in (west −180, east 180 = all
 * the way round). */
export type MolehillLevelPlan = {
  readonly level: number;
  readonly z: number;
  readonly box: LonLatBounds;
};
