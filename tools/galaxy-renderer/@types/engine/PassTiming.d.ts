/**
 * PassTiming — one GPU-timestamp slot's rolling-average span, in milliseconds.
 *
 * ORDINAL ONLY. These spans come from `timestamp-query` write pairs bracketing
 * individual render passes, and on a tile-based deferred GPU (every Apple
 * Silicon machine) the driver overlaps passes freely — a pass's begin/end pair
 * measures wall time during which OTHER passes were also executing. So the
 * spans do not add up to a frame, and no single one converts to fps. They rank
 * passes against each other and against their own history; that is the whole
 * contract. `PerfReport.frameMs` is the additive number.
 */

export type PassTiming = {
  /** The timing slot's name, as registered with the timing service. */
  readonly slot: string;
  /** Rolling mean of the slot's recent spans, in milliseconds. */
  readonly ms: number;
};
