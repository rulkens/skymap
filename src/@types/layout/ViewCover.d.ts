import type { CoverEdge } from './CoverEdge';

/** `reachPx` is CSS px from the canvas `edge` to the panel's inner edge. */
export type ViewCover = {
  readonly edge: CoverEdge;
  readonly reachPx: number;
};
