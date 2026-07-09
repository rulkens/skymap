/**
 * GenerationPipelines — the two GPU compute pipelines that generate one
 * galaxy's stars and dust, built once per device by
 * `createGenerationPipelines` and re-used across every `encodeGeneration`
 * call. Split into `stars`/`dust` (rather than one pipeline with a mode
 * uniform) because the two entry points — `generateStars.wesl`,
 * `generateDust.wesl` — read different range tables (`gen.starRanges` vs
 * `gen.dustRanges`) and write different output stride layouts; a shared
 * pipeline would need a runtime branch to pick which table to trust, where
 * two pipelines let the WGSL entry point itself be the dispatch.
 */

export type GenerationPipelines = {
  readonly stars: GPUComputePipeline;
  readonly dust: GPUComputePipeline;
};
