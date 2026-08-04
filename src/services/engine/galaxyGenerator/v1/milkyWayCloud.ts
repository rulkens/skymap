/**
 * milkyWayCloud — generates the app's Milky Way star+dust point cloud on the
 * GPU and hands the resulting instance buffers to the draw side. It is the
 * app-side reduction of `createGalaxyEngine.ts`'s central-galaxy generation
 * (`setParams`, ~lines 520-566) to the one fixed preset the Milky Way needs:
 * `MILKY_WAY_GALAXY_PARAMS` with the live `starCount` folded in. `starCount`
 * is an absolute count, not tier-derived — see `MilkyWayCloud`'s docblock for
 * why this module carries no notion of `Tier` at all.
 *
 * ## The generation flow (one count's worth), mirroring `setParams`
 *
 *   carve star + dust layouts  (pure CPU arithmetic — cheap, on this thread)
 *        │
 *        ▼
 *   createBuffer starVB / dustVB  (VERTEX | STORAGE, size = capacity * GEN_RECORD_BYTES)
 *        │
 *        ▼
 *   queue.writeBuffer(ubo, packGenerationUniforms(...))   ── THEN ──►
 *        │
 *        ▼
 *   encodeGeneration(star + dust compute passes)  ── THEN ──►  queue.submit
 *
 * The write-then-encode-then-submit order is the same queue-ordering guarantee
 * `setParams`'s docblock spells out: WebGPU processes everything enqueued on a
 * queue in submission order, so by the time these compute passes run the
 * preceding `writeBuffer` has already landed — no CPU readback, no fence. Any
 * `drawFrame` the app records afterwards shares this device's one queue, so its
 * draws are likewise guaranteed to run after this submit's writes.
 *
 * ## What is built once vs. per generation
 *
 * The two generation compute pipelines (`createGenerationPipelines`) and the
 * generation UBO are built ONCE at factory time and reused by every
 * `regenerate`: the pipelines are pure shader compilation with no per-count
 * state, and the UBO is `GENERATION_UBO.byteLength` — a fixed size — so a
 * count change only rewrites its contents in place rather than reallocating
 * it. Only the star/dust vertex buffers, whose size IS the carved capacity,
 * get destroyed and recreated per generation.
 *
 * ## `extra = null` — placement is draw-side, not baked in
 *
 * Unlike the tool's background extras (which fold their world transform into
 * the generation UBO's extra lanes so their vertices come out world-placed),
 * the Milky Way is generated in its own LOCAL frame and placed by the draw
 * side's model matrix (`milkyWayModelMatrix`). So `packGenerationUniforms` is
 * called with `extra = null`: the compute passes emit local-space records, and
 * nothing about placement lives in the UBO.
 *
 * The generated buffers are the carved layout's full CAPACITY (dead slots
 * included) — see `MilkyWayCloudBuffers`'s docblock and `setParams` for why
 * that is correct rather than wasteful.
 */
import type { MilkyWayCloud } from '../../../../@types/galaxy/MilkyWayCloud';
import type { MilkyWayCloudBuffers } from '../../../../@types/galaxy/MilkyWayCloudBuffers';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../data/milkyWay/milkyWayGalaxyParams';
import { carveDustLayout } from '../shared/carveDustLayout';
import { carveStarLayout } from '../shared/carveStarLayout';
import { classifyHubbleType } from '../shared/classifyHubbleType';
import { createGenerationPipelines } from './createGenerationPipelines';
import { describeGalaxy } from '../shared/describeGalaxy';
import { encodeGeneration } from './encodeGeneration';
import { GEN_RECORD_BYTES } from './genRecordBytes';
import { GENERATION_UBO } from '../shared/generationUboLayout';
import { packGenerationUniforms } from '../shared/packGenerationUniforms';
import { splitStarBudget } from '../shared/splitStarBudget';

export function createMilkyWayCloud(device: GPUDevice, starCount: number): MilkyWayCloud {
  // Built once, reused by every regenerate: pipelines are stateless shader
  // compilation, and the UBO is a fixed size that only ever gets rewritten.
  const pipelines = createGenerationPipelines(device);
  const ubo = device.createBuffer({
    label: 'galaxy:mwGenUbo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Carve the preset (with the live starCount knob folded straight in —
  // absolute, not a tier-relative multiplier), allocate the star/dust
  // buffers, pack + write the UBO, then dispatch generation into a fresh
  // encoder and submit. Returns the freshly-generated buffer snapshot.
  function generate(count: number): MilkyWayCloudBuffers {
    const params = {
      ...MILKY_WAY_GALAXY_PARAMS,
      starCount: count,
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
  // rather than mutated field-by-field. `currentCount` is what lets `runFrame`
  // detect a stale generation without keeping its own shadow copy of the
  // value — the generator is the one place that fact is true.
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

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    current.starBuf.destroy();
    current.dustBuf?.destroy();
    ubo.destroy();
  }

  return { buffers, starCount: starCountOf, regenerate, destroy };
}
