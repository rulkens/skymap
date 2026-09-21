/**
 * createIsmMapGenerator — owns the fluid ISM-map pipeline
 * (`createIsmMapFluidRunner`) and the shared output artifact
 * (`createIsmMapOutput`) it writes into. `tuning.ismMap.generator` is still
 * the ONE gate for whether it runs at all (`'none'` vs `'fluid'`) — every
 * OTHER consumer (present pass, orientation chain, readback) binds to
 * `IsmMapOutput`'s stable objects, never to the runner directly, so
 * flipping the toggle never touches their bind groups.
 */
import { ismMapGridRadiusOrDefault } from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { createIsmMapOutput } from './createIsmMapOutput';
import { createIsmMapFluidRunner } from './createIsmMapFluidRunner';
import type { IsmMapGenerator } from '../../../../../@types/galaxy/IsmMapGenerator';
import type { GalaxyIsmMapGridRadius } from '../../../../../@types/galaxy/GalaxyIsmMapGridRadius';

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
    ringMeansReadbackBuffer: output.ringMeansReadbackBuffer,
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
