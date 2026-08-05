/**
 * createSfMapGenerator — the ONE dispatcher that picks between the two
 * independent SF-map pipelines (`createSfMapAutomatonRunner`,
 * `createSfMapFluidRunner`) on `tuning.sfMap.generator`, and owns the shared
 * output artifact (`createSfMapOutput`) both write into. This is the ONLY
 * place that branches on `generator` — neither runner knows the other
 * exists, and every OTHER consumer (present pass, orientation chain,
 * readback) binds to `SfMapOutput`'s stable objects, never to a runner
 * directly, so switching the toggle never touches their bind groups.
 */
import {
  sfMapGridRadiusOrDefault,
  type GalaxySfMapGridRadius,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { createSfMapOutput } from './createSfMapOutput';
import { createSfMapAutomatonRunner } from './createSfMapAutomatonRunner';
import { createSfMapFluidRunner } from './createSfMapFluidRunner';

export type SfMapGenerator = {
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  readonly dustBlurTexture: GPUTexture;
  readonly gridBuffer: GPUBuffer;
  readonly mapSampler: GPUSampler;
  /**
   * Rerun whichever generator `tuning.sfMap.generator` names over `geometry`,
   * or clear the shared output when there is no geometry / the tuning has it
   * disabled / the active generator's own step count is 0. Returns the grid
   * it wrote, so the caller's readback records the rMin/rMax matching the
   * CONTENT rather than re-deriving a grid that may have moved since.
   */
  rebuild(input: {
    readonly geometry: GalaxyDescription | null;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
  }): GalaxySfMapGridRadius;
  dispose(): void;
};

export function createSfMapGenerator(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
  },
): SfMapGenerator {
  const output = createSfMapOutput(device, deps);
  const automatonRunner = createSfMapAutomatonRunner(device, {
    makeShader: deps.makeShader,
    output,
  });
  const fluidRunner = createSfMapFluidRunner(device, { makeShader: deps.makeShader, output });

  return {
    texture: output.texture,
    readbackBuffer: output.readbackBuffer,
    readbackBytesPerRow: output.readbackBytesPerRow,
    presentPipeline: output.presentPipeline,
    presentBindGroup: output.presentBindGroup,
    dustBlurTexture: output.dustBlurTexture,
    gridBuffer: output.gridBuffer,
    mapSampler: output.mapSampler,

    rebuild({ geometry, tuning, seed }): GalaxySfMapGridRadius {
      const grid = sfMapGridRadiusOrDefault(geometry);
      output.writeGrid(grid);

      const generator = tuning.sfMap.generator;
      const activeSteps =
        generator === 'fluid' ? tuning.sfMapFluid.steps : tuning.sfMapAutomaton.steps;

      if (!geometry || !tuning.sfMap.enabled || activeSteps <= 0) {
        // Disabled (or no galaxy yet): leave nothing stale for the sfMap view
        // to show. Cleared once rather than latched, since this path is a rare
        // toggle, not a per-frame branch.
        output.clear();
        return grid;
      }

      // The ONLY branch point — see this file's header.
      if (generator === 'fluid') {
        fluidRunner.rebuild({ geometry, tuning, seed, grid });
      } else {
        automatonRunner.rebuild({ geometry, tuning, seed, grid });
      }
      return grid;
    },

    dispose(): void {
      automatonRunner.dispose();
      fluidRunner.dispose();
      output.dispose();
    },
  };
}
