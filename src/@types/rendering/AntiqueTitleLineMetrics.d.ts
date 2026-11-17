/** A title line's ink box at a 1 px em, condensing aside: what `fitAntiqueTitle` lays out from. */
export type AntiqueTitleLineMetrics = {
  readonly width: number;
  readonly height: number;
  /** The face's cap height ('H'), so groups size from caps, not ink boxes. */
  readonly cap: number;
};
