/**
 * BloomStepSpec — the screen-space bloom sub-pipeline. ONE line, not N:
 * `runBloom` opens its ten passes in an order the step model cannot express.
 */
export type BloomStepSpec = { readonly kind: 'bloom' };
