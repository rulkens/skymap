/**
 * GridBuffers — every GPU allocation the sim owns. The three grids are
 * `array<GridElem>`, so f16 halves their bytes; the agent lanes stay f32
 * whatever the grid element is. `histogram` is allocated here and first used
 * by the trace-histogram pass; `densities` and `histogramFlags` are its
 * siblings — one density sample per agent-lane slot (the kernel only
 * ever writes the first `nDataPoints` of them) and the pass's own tiny
 * uniform (just `sampleRandomly` — the pass reuses `uniform`/McpmUniforms
 * for everything else; see histogram.wesl's header for why it can't have
 * its own full-size uniform).
 */
export type GridBuffers = {
  readonly depositA: GPUBuffer;
  readonly depositB: GPUBuffer;
  readonly trace: GPUBuffer;
  readonly agentX: GPUBuffer;
  readonly agentY: GPUBuffer;
  readonly agentZ: GPUBuffer;
  readonly agentPhi: GPUBuffer;
  readonly agentTheta: GPUBuffer;
  readonly agentWeight: GPUBuffer;
  readonly histogram: GPUBuffer;
  readonly densities: GPUBuffer;
  readonly histogramFlags: GPUBuffer;
  readonly uniform: GPUBuffer;
  destroy(): void;
};
