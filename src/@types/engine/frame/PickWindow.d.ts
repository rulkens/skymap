import type { Vec2 } from '../../math/Vec2';

/**
 * The canvas rectangle a `SlabView` rasterises, in canvas device px (the
 * space of `ctx.canvasSize`). The whole canvas everywhere but `pick()`.
 */
export type PickWindow = {
  /** Top-left corner, canvas device px. */
  readonly originPx: Readonly<Vec2>;
  /** Window size in device px; also the pick target's size. */
  readonly sizePx: Readonly<Vec2>;
};
