/** One `labelRenderer` pipeline pair over the same layout: glyph quads, and leader quads. */
export type LabelPipelines = {
  readonly glyphs: GPURenderPipeline;
  readonly leaders: GPURenderPipeline;
};
