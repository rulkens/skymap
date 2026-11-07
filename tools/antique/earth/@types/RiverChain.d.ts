/** A river's pieces joined end to end, oriented source → mouth, lon/lat degrees. */
export type RiverChain = {
  readonly scalerank: number;
  readonly minZoom: number;
  readonly points: readonly (readonly [number, number])[];
  readonly lengthKm: number;
  /** Length of the longest river ending at this chain's first vertex, so the
   * width taper carries on where that feeder's left off. */
  readonly upstreamKm: number;
};
