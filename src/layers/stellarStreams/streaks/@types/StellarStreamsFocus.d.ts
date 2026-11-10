/** How a focus shades the streams: every stream but `focusedStream` (−1 = none) draws at `recede`, that one at `focusBoost`. */
export type StellarStreamsFocus = {
  /** `emphasisOf` for the show entry: 1 at rest. */
  readonly recede: number;
  /** The focused stream's index (its pick-local index and `attr.w`), or −1. */
  readonly focusedStream: number;
  /** The focused stream's meta `focusBoost`, ramped in by the focus blend: 1 at rest. */
  readonly focusBoost: number;
};
