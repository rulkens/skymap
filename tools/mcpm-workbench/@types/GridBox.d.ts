import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * GridBox — placement and cubic voxel size of the MCPM simulation grid.
 *
 * `sizeMpc`, `dims`, and `voxelSizeMpc` are not independent: sizeMpc = dims ×
 * voxelSizeMpc exactly, and voxelSizeMpc is identical on every axis. Construct
 * only through `autoFitGridBox` — see that module for why (buildRhizomeVolume's
 * cubic-voxel spread assert depends on it).
 */
export type GridBox = {
  readonly centerMpc: Vec3;
  readonly sizeMpc: Vec3; // dims × voxelSizeMpc, exactly
  readonly dims: Vec3; // each a multiple of 8
  readonly voxelSizeMpc: number; // cubic, by construction
};
