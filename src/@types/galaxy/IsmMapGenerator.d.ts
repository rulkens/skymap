import { type GalaxyIsmMapGridRadius } from './GalaxyIsmMapGridRadius';
import type { GalaxyDescription } from './GalaxyDescription';
import type { GalaxyFieldTuning } from './GalaxyFieldTuning';

export type IsmMapGenerator = {
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  readonly dustBlurTexture: GPUTexture;
  /** Cartesian re-bake of the packed map (stage 1 of the dust-seeding perf spike) — see IsmMapOutput's own doc. Not yet bound by any consumer (stage 2). */
  readonly cartesianTexture: GPUTexture;
  readonly gridBuffer: GPUBuffer;
  /** `createIsmMapRingReduce.ts`'s dispatch target — see `IsmMapOutput`'s own doc. */
  readonly ringMeansBuffer: GPUBuffer;
  /** Debug-only staging buffer for `createIsmMapReadbacks.ts`'s `requestRingMeans` — see `IsmMapOutput`'s own doc. */
  readonly ringMeansReadbackBuffer: GPUBuffer;
  readonly mapSampler: GPUSampler;
  /** The "seeding" debug view's radial envelope divisor — see `IsmMapOutput`'s own doc. Not tied to `rebuild()`: the readback landing (`createGalaxyModel.ts`) calls this directly once the CPU-side ring means are computed. */
  writeRingMeans(means: Float32Array): void;
  /**
   * Rerun whichever generator `tuning.ismMap.generator` names over `geometry`,
   * or clear the shared output when there is no geometry / the tuning has it
   * disabled / the active generator's own step count is 0. Returns the grid
   * it wrote, so the caller's readback records the rMin/rMax matching the
   * CONTENT rather than re-deriving a grid that may have moved since.
   */
  rebuild(input: {
    readonly geometry: GalaxyDescription | null;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
  }): GalaxyIsmMapGridRadius;
  dispose(): void;
};
