/** Shared shape for the two flux-weight-sum dispatches below — `fluxWeightBuffer` is the producer's own `fluxWeightOut`, `count` its reservation's live count. */
export type DispatchFluxWeightSumInput = {
  readonly fluxWeightBuffer: GPUBuffer;
  readonly count: number;
};
