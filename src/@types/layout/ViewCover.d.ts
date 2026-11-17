import type { CoverEdge } from './CoverEdge';
import type { Vec2 } from '../math/Vec2';

/**
 * `reachPx` is CSS px from the canvas `edge` to the panel's inner edge;
 * `spanPx` is its extent along that edge, from the canvas top for a 'left' or
 * 'right' edge and from the canvas left for 'top' or 'bottom'.
 */
export type ViewCover = {
  readonly edge: CoverEdge;
  readonly reachPx: number;
  readonly spanPx: Readonly<Vec2>;
};
