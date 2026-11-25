import type { GridSlice } from '../../@types/GridSlice';
import { deriveGridBox } from '../field/deriveGridBox';
import { gridElementOf } from '../field/gridElementOf';
import { BYTES_PER_ELEMENT } from './createGridBuffers';
import { bufferBytesForDims } from './planGridBudget';

/**
 * estimateBoxGridBufferBytes — one grid buffer (deposit or trace, all three the
 * same size) of the box as set now, the term planGridBudget checks against
 * `bufferLimitBytes` for each grid.
 */
export function estimateBoxGridBufferBytes(grid: GridSlice): number {
  return bufferBytesForDims(deriveGridBox(grid).dims, BYTES_PER_ELEMENT[gridElementOf(grid)]);
}
