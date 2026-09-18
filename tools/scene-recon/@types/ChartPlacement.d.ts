import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Source texels → destination texels for one chart: `d = R(turns)·(s·scale) + offsetPx`,
 *  R a 90° multiple. Integer `offsetPx` keeps texel centres on texel centres under R. */
export type ChartPlacement = {
  readonly turns: 0 | 1 | 2 | 3;
  readonly scale: number; // 1 ⇔ the exact bake
  readonly offsetPx: Vec2; // integral
};
