import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { ColumnAggregate } from '../@types/octree/ColumnAggregate';

// Render columns only: info columns are never aggregated (a blob has no info record).
// Magnitudes average as mean flux, never as magnitudes: a blob's `absMag` is a single-record
// value the shader multiplies back up by `blobCount`, so it stays inside the LUT window.
export const COLUMN_AGGREGATE: Readonly<Partial<Record<ColumnId, ColumnAggregate>>> = {
  offset: 'fluxCentroid',
  absMag: 'fluxMeanMagnitude',
  colourIndex: 'fluxWeightedMean',
  axisRatio: 'fluxWeightedMean',
  pa: 'axialFluxMean',
  logSize: 'fluxWeightedMean',
  flags: 'none',
  angularWeight: 'fluxWeightedMean',
};
