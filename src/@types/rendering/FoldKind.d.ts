/**
 * FoldKind — which glow a `BloomPyramid.fold` draw adds into HDR. Each kind
 * owns its own fold uniform buffer, so several folds drawn in one frame never
 * share a buffer (the writeBuffer/submit race the pyramid's per-level buffers
 * exist to avoid).
 */
export type FoldKind = 'bloom';
