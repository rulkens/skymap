/**
 * An old stellar population's light at one [Fe/H], by star type: the share of the V-band light
 * each type gives and its light-weighted mean B−V. Giants take the share left over.
 */
export type StreamPopulationAnchor = {
  readonly feh: number;
  readonly bhbShare: number;
  readonly turnoffShare: number;
  readonly bhbBv: number;
  readonly turnoffBv: number;
  readonly giantBv: number;
};
