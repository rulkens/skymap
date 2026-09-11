/**
 * BloomStepSpec — an authored `FRAME_ORDER` line for the screen-space bloom
 * sub-pipeline. ONE line, not N: `runBloom` opens its ten passes in strict
 * order, which the `(target, slab)` render-step model cannot express.
 */
export type BloomStepSpec = { readonly kind: 'bloom' };
