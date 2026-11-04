/**
 * BlendMode — output blend mode for `InstancedQuadRenderer`.  ADDITIVE
 * for all three current emissive impostor passes; ALPHA reserved for a
 * hypothetical opaque-material consumer.
 */
export type BlendMode = 'additive' | 'alpha';
