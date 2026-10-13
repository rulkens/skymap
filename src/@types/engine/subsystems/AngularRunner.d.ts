import type { ComputeAngularWeightsInput } from '../../../../tools/@types/catalog/ComputeAngularWeightsInput';

/** Async function from an angular bake input to per-galaxy weights. */
export type AngularRunner = (input: ComputeAngularWeightsInput) => Promise<Float32Array>;
