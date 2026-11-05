import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { ColumnAggregate } from '../@types/octree/ColumnAggregate';

// Magnitudes average as mean flux, never as magnitudes: a blob's `absMag` is a single-star
// value the shader multiplies back up by `blobCount`, so it stays inside the LUT window.
export const COLUMN_AGGREGATE: Readonly<Record<ColumnId, ColumnAggregate>> = {
  offset: 'fluxCentroid',
  absMag: 'fluxMeanMagnitude',
  colourIndex: 'fluxWeightedMean',
};
