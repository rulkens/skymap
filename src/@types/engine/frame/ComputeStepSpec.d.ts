/**
 * ComputeStepSpec — a pre-render compute dispatch. `name` keys the executor's
 * COMPUTE table; a compute step draws nothing and bills no GPU-timing slot.
 */
export type ComputeStepSpec = { readonly kind: 'compute'; readonly name: string };
