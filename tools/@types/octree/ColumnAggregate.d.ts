/**
 * How a blob forms one column from the records it stands for, weighted by their flux
 * `10^(−0.4·M)`: a centroid (as a fraction of the node's box), the magnitude of the mean flux,
 * a flux-weighted mean, the flux-weighted mean of an axis angle (degrees, period 180), or
 * nothing (the blob value is 0, for per-record bits with no meaningful mean).
 */
export type ColumnAggregate =
  | 'fluxCentroid'
  | 'fluxMeanMagnitude'
  | 'fluxWeightedMean'
  | 'axialFluxMean'
  | 'none';
