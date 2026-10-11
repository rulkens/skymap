/**
 * How a blob forms one column from the records it stands for, weighted by their flux
 * `10^(−0.4·M)`: a centroid (as a fraction of the node's box), the magnitude of the mean flux,
 * or a flux-weighted mean.
 */
export type ColumnAggregate = 'fluxCentroid' | 'fluxMeanMagnitude' | 'fluxWeightedMean';
