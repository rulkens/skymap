/**
 * createIsmMapGenerator — owns the fluid ISM-map pipeline
 * (`createIsmMapFluidRunner`) and the shared output artifact
 * (`createIsmMapOutput`) it writes into. `tuning.ismMap.generator` is still
 * the ONE gate for whether it runs at all (`'none'` vs `'fluid'`) — every
 * OTHER consumer (present pass, orientation chain, readback) binds to
 * `IsmMapOutput`'s stable objects, never to the runner directly, so
 * flipping the toggle never touches their bind groups.
 */
import {
  ismMapGridRadiusOrDefault,
  type GalaxyIsmMapGridRadius,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { createIsmMapOutput } from './createIsmMapOutput';
import { createIsmMapFluidRunner } from './createIsmMapFluidRunner';

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

export function createIsmMapGenerator(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
  },
): IsmMapGenerator {
  const output = createIsmMapOutput(device, deps);
  const fluidRunner = createIsmMapFluidRunner(device, { makeShader: deps.makeShader, output });

  return {
    texture: output.texture,
    readbackBuffer: output.readbackBuffer,
    readbackBytesPerRow: output.readbackBytesPerRow,
    presentPipeline: output.presentPipeline,
    presentBindGroup: output.presentBindGroup,
    dustBlurTexture: output.dustBlurTexture,
    cartesianTexture: output.cartesianTexture,
    gridBuffer: output.gridBuffer,
    ringMeansBuffer: output.ringMeansBuffer,
    mapSampler: output.mapSampler,
    writeRingMeans: output.writeRingMeans,

    rebuild({ geometry, tuning, seed }): GalaxyIsmMapGridRadius {
      const grid = ismMapGridRadiusOrDefault(geometry);
      output.writeGrid(grid);

      const generator = tuning.ismMap.generator;

      if (!geometry || generator === 'none' || tuning.ismMapFluid.steps <= 0) {
        // No generator selected (or no galaxy yet): leave nothing stale for
        // the ismMap view to show. Cleared once rather than latched, since
        // this path is a rare toggle, not a per-frame branch.
        output.clear();
        return grid;
      }

      fluidRunner.rebuild({ geometry, tuning, seed, grid });
      return grid;
    },

    dispose(): void {
      fluidRunner.dispose();
      output.dispose();
    },
  };
}
