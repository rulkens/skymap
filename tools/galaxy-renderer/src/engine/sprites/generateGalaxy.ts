/**
 * generateGalaxy — the GPU generation sequence, for the central galaxy
 * (`spec` null) and for one background extra alike. Carving the layouts is
 * cheap pure arithmetic and runs on the caller's thread; the star/dust MATH
 * runs on the GPU in `encodeGeneration`'s two compute passes.
 *
 * The CALLER owns every lifetime: which UBO to write, which encoder to record
 * into and when to submit it, and destroying the buffers this returns. `spec`
 * also picks the buffer labels, so a validation error names the galaxy it came
 * from.
 */
import type { ExtraGalaxySpec } from '../../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GenerationPipelines } from '../../../../../src/@types/galaxy/GenerationPipelines';

import { carveDustLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveDustLayout';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { packGenerationUniforms } from '../../../../../src/services/engine/galaxyGenerator/v1/packGenerationUniforms';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import { encodeGeneration } from '../../../../../src/services/engine/galaxyGenerator/v1/encodeGeneration';
import { GEN_RECORD_BYTES } from '../../../../../src/services/engine/galaxyGenerator/v1/genRecordBytes';

export type GeneratedGalaxy = {
  readonly starBuf: GPUBuffer;
  /**
   * The carved CAPACITY, not a "how many stars will be visible" count: a
   * population's `iterations` is its builder's loop bound, and some iterations
   * write a zero-brightness record (an arm star past its fade radius) without
   * shrinking the layout. The compute pass fills every slot and the render
   * pipelines draw all of them — a dead slot rasterizes nothing, so nothing is
   * drawn wrong; it just costs a few zero-alpha billboards.
   */
  readonly starCount: number;
  readonly dustBuf: GPUBuffer | null;
  /** The carved capacity, as `starCount` is. */
  readonly dustCount: number;
  /**
   * What the HUD bills, with the dust capacity: the sum of each population's
   * `iterations` — NOT `iterations * stride`, which would double-count the
   * worst-case HII-bonus slots most iterations never use. An estimate, not a
   * tally: actual live counts differ by a few percent, the same slack
   * `iterations` always carried against its builder's real output (see
   * `PopulationRange`'s docblock).
   */
  readonly plannedStars: number;
  readonly geometry: GalaxyDescription;
};

export function generateGalaxy(input: {
  readonly device: GPUDevice;
  readonly pipelines: GenerationPipelines;
  readonly params: GalaxyParams;
  /** null = the central galaxy; a spec also picks the buffer labels. */
  readonly spec: ExtraGalaxySpec | null;
  readonly ubo: GPUBuffer;
  readonly encoder: GPUCommandEncoder;
}): GeneratedGalaxy {
  const { device, pipelines, params, spec, ubo, encoder } = input;

  const category = classifyHubbleType(params.type);
  const budget = splitStarBudget(category, params);
  const description = describeGalaxy(params);
  const starLayout = carveStarLayout(category, params, budget);
  const dustLayout = carveDustLayout(category, params, budget);

  // A zero-capacity star layout is not expected in practice (every category's
  // split puts at least some stars in bulge/disk/halo), but a zero-size
  // GPUBuffer is invalid, so clamp to one record just in case.
  const starBuf = device.createBuffer({
    label: spec ? 'galaxy:extraStarVB' : 'galaxy:starVB',
    size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
  });
  const dustBuf =
    dustLayout.capacity > 0
      ? device.createBuffer({
          label: spec ? 'galaxy:extraDustVB' : 'galaxy:dustVB',
          size: dustLayout.capacity * GEN_RECORD_BYTES,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
        })
      : null;

  const genUniforms = packGenerationUniforms(description, params, budget, spec);
  device.queue.writeBuffer(ubo, 0, genUniforms);
  encodeGeneration({
    device,
    encoder,
    pipelines,
    ubo,
    starBuf,
    starLayout,
    dustBuf,
    dustLayout,
  });

  return {
    starBuf,
    starCount: starLayout.capacity,
    dustBuf,
    dustCount: dustLayout.capacity,
    plannedStars: starLayout.ranges.reduce((sum, r) => sum + r.iterations, 0),
    geometry: description,
  };
}
