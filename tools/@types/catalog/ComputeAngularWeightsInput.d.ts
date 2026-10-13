import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../src/@types/data/SourceType';

/** Inputs for `computeAngularWeights`. */
export type ComputeAngularWeightsInput = {
  cloud: GalaxyCatalog;
  /** Unused by the purely geometric binning; kept for parity with the Schechter input. */
  source: SourceType;
  /** Weight clamp; defaults [0.3, 1.2]. `buildFilaments` widens it to [1, 15] for point duplication. */
  weightMin?: number;
  weightMax?: number;
};
