/**
 * milkyWayCloud — generates the app's Milky Way star+dust point cloud on the
 * GPU and hands the resulting instance buffers to the draw side. The app-side
 * reduction of the tool's central-galaxy generation (`createGalaxyModel.ts`'s
 * `setParams`) to the one fixed preset the Milky Way needs, with the live
 * `starCount` folded in as an absolute count (see `MilkyWayCloud`'s docblock
 * for why this module carries no notion of `Tier`).
 *
 * Write → encode → submit, in that order, on the device's one queue: WebGPU
 * processes a queue in submission order, so the compute passes below see the
 * `writeBuffer`'d UBO with no readback and no fence needed.
 */
import type { MilkyWayCloud } from '../../../../@types/galaxy/MilkyWayCloud';
import type { MilkyWayCloudBuffers } from '../../../../@types/galaxy/MilkyWayCloudBuffers';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../data/milkyWay/milkyWayGalaxyParams';
import { carveDustLayout } from './carveDustLayout';
import { carveStarLayout } from './carveStarLayout';
import { classifyHubbleType } from '../shared/classifyHubbleType';
import { createGenerationPipelines } from './createGenerationPipelines';
import { describeGalaxy } from '../shared/describeGalaxy';
import { encodeGeneration } from './encodeGeneration';
import { GEN_RECORD_BYTES } from './genRecordBytes';
import { GENERATION_UBO } from '../shared/generationUboLayout';
import { packGenerationUniforms } from './packGenerationUniforms';
import { splitStarBudget } from './splitStarBudget';

export function createMilkyWayCloud(device: GPUDevice, starCount: number): MilkyWayCloud {
  // Built once, reused by every regenerate: pipelines are stateless shader
  // compilation, and the UBO is a fixed size that only ever gets rewritten.
  const pipelines = createGenerationPipelines(device);
  const ubo = device.createBuffer({
    label: 'galaxy:mwGenUbo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function generate(count: number): MilkyWayCloudBuffers {
    const params = {
      ...MILKY_WAY_GALAXY_PARAMS,
      legacy: { ...MILKY_WAY_GALAXY_PARAMS.legacy, starCount: count },
    };
    const category = classifyHubbleType(params.type);
    const budget = splitStarBudget(category, params);
    const starLayout = carveStarLayout(category, params, budget);
    const dustLayout = carveDustLayout(category, params, budget);

    // A zero-capacity star layout isn't expected for this preset (every
    // category's split seeds bulge/disk/halo), but a zero-size GPUBuffer is
    // invalid, so clamp to one record just in case — same guard as `setParams`.
    const starBuf = device.createBuffer({
      label: 'galaxy:mwStarVB',
      size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
    });

    // The dust buffer is omitted when the carve yields no dust capacity (an
    // ineligible category). The Milky Way preset always carves dust, but the
    // guard keeps the code honest against a future preset change.
    const dustBuf =
      dustLayout.capacity > 0
        ? device.createBuffer({
            label: 'galaxy:mwDustVB',
            size: dustLayout.capacity * GEN_RECORD_BYTES,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
          })
        : null;

    // Local frame: `extra = null`, placement is the draw-side model matrix.
    device.queue.writeBuffer(
      ubo,
      0,
      packGenerationUniforms(describeGalaxy(params), params, budget, null),
    );

    const encoder = device.createCommandEncoder({ label: 'galaxy:mwGenerate' });
    encodeGeneration({ device, encoder, pipelines, ubo, starBuf, starLayout, dustBuf, dustLayout });
    device.queue.submit([encoder.finish()]);

    return {
      starBuf,
      starCount: starLayout.capacity,
      dustBuf,
      dustCount: dustLayout.capacity,
    };
  }

  // The two mutable cells: the current generation's buffers and the
  // starCount that produced them, both replaced wholesale on each regenerate
  // rather than mutated field-by-field. `currentCount` is what lets
  // `reconcile` detect a stale generation without keeping its own shadow copy
  // of the value — the generator is the one place that fact is true.
  let current = generate(starCount);
  let currentCount = starCount;
  let destroyed = false;

  function buffers(): MilkyWayCloudBuffers {
    return current;
  }

  function starCountOf(): number {
    return currentCount;
  }

  function regenerate(count: number): void {
    // Tear down only the vertex buffers — the UBO is reused (fixed size,
    // rewritten by `generate`). Then dispatch the new generation at the given
    // count.
    current.starBuf.destroy();
    current.dustBuf?.destroy();
    current = generate(count);
    currentCount = count;
  }

  function reconcile(wantedCount: number): void {
    if (currentCount !== wantedCount) regenerate(wantedCount);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    current.starBuf.destroy();
    current.dustBuf?.destroy();
    ubo.destroy();
  }

  return { buffers, starCount: starCountOf, reconcile, regenerate, destroy };
}
