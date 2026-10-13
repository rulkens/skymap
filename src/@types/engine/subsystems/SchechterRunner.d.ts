import type { ComputeSchechterRatiosInput } from '../../../../tools/@types/catalog/ComputeSchechterRatiosInput';

/** Async function from a Schechter bake input to per-galaxy ratios. */
export type SchechterRunner = (input: ComputeSchechterRatiosInput) => Promise<Float32Array>;
