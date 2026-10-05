import type { Turns } from './Turns';
import type { Vec2 } from '../../../src/@types/math/Vec2';

/** Source texels → destination texels for one chart: `d = R(turns)·M·(s·scale) + offsetPx`, R a
 *  90° CCW turn — `R(1)·(x, y) = (−y, x)`, see `rotateTurns.ts` — and M the x-mirror xatlas
 *  applies to charts whose source UVs are wound negatively. Integer `offsetPx` keeps texel
 *  centres on texel centres under R and M. */
export type ChartPlacement = {
  readonly turns: Turns;
  readonly mirrorX: boolean; // M = diag(−1, 1), applied BEFORE the turn
  readonly scale: number; // 1 ⇔ the exact bake
  readonly offsetPx: Vec2; // integral
};
