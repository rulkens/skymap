/** How a focus recedes the streams: every stream but `focusedStream` (−1 = none) draws at `recede`. */
export type StellarStreamsFocus = {
  /** `emphasisOf` for the show entry: 1 at rest. */
  readonly recede: number;
  /** The focused stream's index (its pick-local index and `attr.w`), or −1. */
  readonly focusedStream: number;
};
