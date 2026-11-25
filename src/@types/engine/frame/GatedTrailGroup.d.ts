import type { FrameView } from './FrameView';

/** A Layer's trail group with its show key bound to core's fade by `gateTrailGroup`. */
export type GatedTrailGroup<G> = G & {
  /** The group's handed value (fade × clip × distance band) at this view, resolved by core
   * on each call; 0 while hidden. */
  fade(view: FrameView): number;
};
