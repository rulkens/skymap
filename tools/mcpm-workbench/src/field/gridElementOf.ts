import type { GridElement } from '../../@types/GridElement';
import type { GridSlice } from '../../@types/GridSlice';

/**
 * gridElementOf — the element the grid is built with: the last build's, or f32
 * before the first one. Every live figure (voxel floor, memory) reads it here,
 * so they all agree with the box the sim builds.
 */
export function gridElementOf(grid: GridSlice): GridElement {
  return grid.resolvedElement ?? 'f32';
}
