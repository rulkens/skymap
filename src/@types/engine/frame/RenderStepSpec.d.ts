/**
 * RenderStepSpec — an authored `FRAME_ORDER` line drawing a named roster into
 * one `(target, slab)` group, in the listed order.
 */
export type RenderStepSpec = {
  readonly kind: 'render';
  readonly target: string;
  readonly slab: number;
  readonly passes: readonly string[];
  /**
   * GPU-timing slot suffix, appended to `groupKeyOf(target, slab)` with the same
   * separator; the one line in a group without it owns the bare key. Authored
   * here so a slot's identity is a name, not an ordinal — inserting a line
   * renumbers nothing.
   */
  readonly slot?: string;
};
