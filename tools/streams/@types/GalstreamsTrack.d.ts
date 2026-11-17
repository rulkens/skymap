/** One master-log row of galstreams joined with its track file's columns. */
export type GalstreamsTrack = {
  /** Master-log `Imp`: 'st' a stream track; 'ep' and 'po' other footprints. */
  readonly kind: string;
  /** Master-log `On`: the stream's preferred track. */
  readonly on: boolean;
  /** Master-log `Name`, the stream, shared by all its tracks. */
  readonly name: string;
  /** Master-log `TrackRefs`, e.g. 'ibata2021'. */
  readonly ref: string;
  /** Master-log `width_phi2`, deg; null when the log leaves it unset. */
  readonly widthDeg: number | null;
  /** Track columns, one entry per point in file order; rows without a finite position dropped. */
  readonly ra: readonly number[];
  readonly dec: readonly number[];
  readonly distanceKpc: readonly number[];
  /** mas/yr; NaN where the track carries none. */
  readonly pmRaCosDec: readonly number[];
  readonly pmDec: readonly number[];
  /** km/s; NaN where missing. */
  readonly radialVelocity: readonly number[];
};
