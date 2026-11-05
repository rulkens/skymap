/**
 * Peak cap on a galaxy octree blob's glow (leaves stay uncapped): under the default 2.0 bloom
 * threshold, so a near box-filling glow does not bloom. Light above it is discarded,
 * as the star survey's `aggregateIntensityCap` does.
 */
export const GALAXY_BLOB_PEAK_CAP = 1;
