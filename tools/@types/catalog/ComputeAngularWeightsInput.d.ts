import type { GalaxyCatalog } from '../../../packages/shared/src/@types/data/galaxyCatalog/GalaxyCatalog';

/** Inputs for `computeAngularWeights`. */
export type ComputeAngularWeightsInput = {
  cloud: GalaxyCatalog;
  /** Weight clamp; defaults [0.3, 1.2]. `buildFilaments` widens it to [1, 15] for point duplication. */
  weightMin?: number;
  weightMax?: number;
};
