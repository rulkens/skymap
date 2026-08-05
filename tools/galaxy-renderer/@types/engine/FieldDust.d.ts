/**
 * FieldDust — the dust lanes as one bundle, because a pass either has a dust
 * slice or it has none; the HII header is the "none" case for all four at once.
 * `extinctionRgb` rides the header rather than a per-component colour lane
 * because dustMap.wesl collapses every dust component into four depth-sliced
 * tau columns before splat.wesl ever sees one (io.wesl's dust-component
 * comment), so the law has to arrive once per frame for the whole galaxy.
 */

import type { Vec3 } from '../../../../src/@types/math/Vec3';

import type { FieldDustNoise } from './FieldDustNoise';
import type { FieldDustSlices } from './FieldDustSlices';

export type FieldDust = {
  /** Length of the dust slice `comps` appends after the emission components. */
  readonly count: number;
  /** The CCM89 law's A_lambda/A_V per channel, for `currentDust.rV`. */
  readonly extinctionRgb: Vec3;
  readonly noise: FieldDustNoise;
  readonly slices: FieldDustSlices;
  /**
   * `dustMapTex`'s OWN pixel height — it carries a divisor independent of every
   * other target's (`createGalaxyRenderTargets`). dustMap.wesl band-limits its
   * four baked octaves against the fragment's world-space pixel footprint with
   * it (io.wesl's counts2.y doc).
   */
  readonly mapHeightPx: number;
  /** The cloud's `mapDetail`, packed to the header's dustDetail lane. */
  readonly detail: number;
  /** `GalaxyDustTuning.sweptMix`, packed to the header's dustDetail.w lane — see `DustHeaderLanes.sweptMix`. */
  readonly sweptMix: number;
};
