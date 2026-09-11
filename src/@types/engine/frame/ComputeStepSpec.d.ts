/**
 * ComputeStepSpec — an authored `FRAME_ORDER` line naming a pre-render compute
 * dispatch. `name` is the key into the executor's COMPUTE table; a compute step
 * draws nothing and bills no GPU-timing slot.
 */
export type ComputeStepSpec = { readonly kind: 'compute'; readonly name: string };
