/**
 * DustHeaderLanes — the dust lanes of the field header that depend only on the
 * galaxy, not on the camera. `deriveDustHeaderLanes` computes all three at
 * once because they share one `GalaxyDustParams`; `FieldDust`'s remaining
 * lanes (`count`, `slices`, `mapHeightPx`) are per-frame or per-pack and are
 * assembled at the pack site.
 */

import type { Vec3 } from '../../../../src/@types/math/Vec3';

import type { FieldDustNoise } from './FieldDustNoise';

export type DustHeaderLanes = {
  /** The CCM89 law's A_lambda/A_V per channel, for the dust params' `rV`. */
  readonly extinctionRgb: Vec3;
  readonly noise: FieldDustNoise;
  /**
   * The dust's own reach R in generator units (io.wesl's dustSlices doc) —
   * 3x the widest disc component's radial sigma. Feeds `dustSliceEdges`, which
   * IS camera-dependent, so this is the galaxy half of that pair.
   */
  readonly reachR: number;
  /**
   * The cloud's S4 map-detail strength (`dust.cloud.mapDetail`), packed to
   * the header's dustDetail lane. 0 while dust is off, same gate as `noise`.
   */
  readonly detail: number;
  /**
   * `GalaxyFieldTuning.dust.sweptMix` (NOT `GalaxyDustParams` — this is the
   * one lane here that comes off the tuning section, not the galaxy's own
   * dust params), packed to the header's dustDetail.w lane. Not gated by
   * `dustEnabled` like the other three: `sfMapDustBlur.wesl`'s own low-pass
   * reads a matching value through its own uniform regardless of whether
   * this pass draws any dust, and disagreeing would just make the S4 ratio
   * wrong on the next enable rather than draw anything extra now.
   */
  readonly sweptMix: number;
};
