/**
 * CopyStepSpec — an authored `FRAME_ORDER` line: draw `source` into THIS
 * view's own output (a dome face's `dome-cube` layer, via `ViewSpec.output`),
 * with no blend and no tone — the sibling of `CompositeStepSpec` for a step
 * whose destination is a view, not a named target row.
 */
export type CopyStepSpec = { readonly kind: 'copy'; readonly source: string };
