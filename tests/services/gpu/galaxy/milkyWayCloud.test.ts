/**
 * milkyWayCloud factory tests.
 *
 * Focuses on the structural resource decisions the factory makes — buffer
 * labels, usage flags, capacity-derived sizes, the write-then-submit
 * generation flow, and the regenerate/destroy lifetime — rather than on the
 * pixels the compute passes produce (that needs a real WebGPU device and lives
 * in the visual gate).
 *
 * Mock pattern follows the renderer factory tests (instancedQuadRenderer,
 * pickRenderer): a stub `GPUDevice` whose methods are `vi.fn()` spies, so we
 * can introspect the descriptors and calls the factory made. WebGPU usage-flag
 * globals (`GPUBufferUsage`) come from `tests/setup/webgpuGlobals.ts`.
 *
 * Expected capacities are DERIVED from `carveStarLayout`/`carveDustLayout`
 * (the single capacity authority) applied to the same per-tier params the
 * factory folds, never hardcoded — the carve fns stay the only source of the
 * numbers, so a tuning change to the preset re-derives the expectation instead
 * of forcing a test edit.
 */
import { describe, it, expect, vi } from 'vitest';

import { createMilkyWayCloud } from '../../../../src/services/gpu/galaxy/milkyWayCloud';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { MILKY_WAY_STARS_PER_TIER } from '../../../../src/services/gpu/galaxy/milkyWayCalibration';
import { carveStarLayout } from '../../../../src/services/gpu/galaxy/carveStarLayout';
import { carveDustLayout } from '../../../../src/services/gpu/galaxy/carveDustLayout';
import { classifyHubbleType } from '../../../../src/services/gpu/galaxy/classifyHubbleType';
import { splitStarBudget } from '../../../../src/services/gpu/galaxy/splitStarBudget';
import { GEN_RECORD_BYTES } from '../../../../src/services/gpu/galaxy/genRecordBytes';
import { GENERATION_UBO } from '../../../../src/services/gpu/galaxy/generationUboLayout';
import type { Tier } from '../../../../src/@types/data/Tier';

/** A stub GPUBuffer that records its descriptor and whether it was destroyed. */
type StubBuffer = GPUBuffer & {
  readonly __desc: GPUBufferDescriptor;
  readonly destroy: ReturnType<typeof vi.fn<() => void>>;
};

/**
 * Stub `GPUDevice` builder. Every factory-visible method is a spy; buffers,
 * UBO writes, and queue submits are captured so tests can introspect them.
 * The compute-pass encoder is stubbed just enough for `encodeGeneration` to
 * record its dispatches without a real device.
 */
function makeStubDevice() {
  const buffers: StubBuffer[] = [];
  const writes: Array<{ readonly buffer: unknown; readonly data: ArrayBuffer }> = [];
  const submit = vi.fn<() => void>();

  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: () => ({}),
    })),
    createBindGroup: vi.fn(() => ({})),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
      const buf = {
        __desc: desc,
        label: desc.label,
        destroy: vi.fn<() => void>(),
      } as unknown as StubBuffer;
      buffers.push(buf);
      return buf;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: () => ({
        setPipeline: vi.fn<() => void>(),
        setBindGroup: vi.fn<() => void>(),
        dispatchWorkgroups: vi.fn<() => void>(),
        end: vi.fn<() => void>(),
      }),
      finish: () => ({}),
    })),
    queue: {
      writeBuffer: vi.fn((buffer: unknown, _offset: number, data: ArrayBuffer) => {
        writes.push({ buffer, data });
      }),
      submit,
    },
  } as unknown as GPUDevice;

  return { device, buffers, writes, submit };
}

/** Re-derive the carved star/dust capacities for a tier, from the same fold the factory uses. */
function expectedCapacities(tier: Tier): { readonly star: number; readonly dust: number } {
  const params = { ...MILKY_WAY_GALAXY_PARAMS, starCount: MILKY_WAY_STARS_PER_TIER[tier] };
  const category = classifyHubbleType(params.type);
  const budget = splitStarBudget(category, params);
  return {
    star: carveStarLayout(category, params, budget).capacity,
    dust: carveDustLayout(category, params, budget).capacity,
  };
}

function findByLabel(buffers: readonly StubBuffer[], label: string): StubBuffer[] {
  return buffers.filter((b) => b.__desc.label === label);
}

describe('createMilkyWayCloud', () => {
  it('creates star and dust VBs with the pinned labels, VERTEX|STORAGE usage, and capacity x GEN_RECORD_BYTES sizes', () => {
    const { device, buffers } = makeStubDevice();
    createMilkyWayCloud(device, 'medium');

    const expected = expectedCapacities('medium');
    // The preset is barred (SBb) with dust > 0, so both layouts carve capacity.
    expect(expected.star).toBeGreaterThan(0);
    expect(expected.dust).toBeGreaterThan(0);

    const starVBs = findByLabel(buffers, 'galaxy:mwStarVB');
    expect(starVBs).toHaveLength(1);
    const starVB = starVBs[0]!;
    expect(starVB.__desc.size).toBe(expected.star * GEN_RECORD_BYTES);
    expect(starVB.__desc.usage).toBe(GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE);

    const dustVBs = findByLabel(buffers, 'galaxy:mwDustVB');
    expect(dustVBs).toHaveLength(1);
    const dustVB = dustVBs[0]!;
    expect(dustVB.__desc.size).toBe(expected.dust * GEN_RECORD_BYTES);
    expect(dustVB.__desc.usage).toBe(GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE);

    // The UBO is the fixed generation-uniform size, UNIFORM | COPY_DST.
    const ubos = findByLabel(buffers, 'galaxy:mwGenUbo');
    expect(ubos).toHaveLength(1);
    expect(ubos[0]!.__desc.size).toBe(GENERATION_UBO.byteLength);
    expect(ubos[0]!.__desc.usage).toBe(GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  });

  it('medium tier packs the preset starCount and large packs x2', () => {
    // The per-tier table is the fold's authority: medium IS the preset budget,
    // large is 2x. The carved star capacity scales with it, and the packed UBO
    // carries that capacity in its `starCapacity` lane — so reading it back
    // confirms the tier's starCount reached generation.
    expect(MILKY_WAY_STARS_PER_TIER.medium).toBe(MILKY_WAY_GALAXY_PARAMS.starCount);
    expect(MILKY_WAY_STARS_PER_TIER.large).toBe(MILKY_WAY_STARS_PER_TIER.medium * 2);

    const readPackedStarCapacity = (tier: Tier): number => {
      const { device, writes } = makeStubDevice();
      createMilkyWayCloud(device, tier);
      // One generation => one UBO write.
      expect(writes).toHaveLength(1);
      const u32 = new Uint32Array(writes[0]!.data);
      return u32[GENERATION_UBO.u32.starCapacity]!;
    };

    const mediumCap = readPackedStarCapacity('medium');
    const largeCap = readPackedStarCapacity('large');

    expect(mediumCap).toBe(expectedCapacities('medium').star);
    expect(largeCap).toBe(expectedCapacities('large').star);
    // Doubling the star budget grows the carved star capacity.
    expect(largeCap).toBeGreaterThan(mediumCap);
  });

  it('regenerate destroys the old buffers and submits a new generation', () => {
    const { device, submit } = makeStubDevice();
    const cloud = createMilkyWayCloud(device, 'medium');

    // Grab the initial generation's buffers before they're replaced.
    const before = cloud.buffers();
    const oldStar = before.starBuf as StubBuffer;
    const oldDust = before.dustBuf as StubBuffer;
    expect(submit).toHaveBeenCalledTimes(1);

    cloud.regenerate('large');

    // Old vertex buffers torn down; a second generation submitted.
    expect(oldStar.destroy).toHaveBeenCalledTimes(1);
    expect(oldDust.destroy).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(2);

    // The snapshot now points at fresh, undestroyed buffers.
    const after = cloud.buffers();
    expect(after.starBuf).not.toBe(oldStar);
    expect((after.starBuf as StubBuffer).destroy).not.toHaveBeenCalled();
  });

  it('destroy releases buffers and UBO', () => {
    const { device, buffers } = makeStubDevice();
    const cloud = createMilkyWayCloud(device, 'medium');

    const snapshot = cloud.buffers();
    const star = snapshot.starBuf as StubBuffer;
    const dust = snapshot.dustBuf as StubBuffer;
    const ubo = findByLabel(buffers, 'galaxy:mwGenUbo')[0]!;

    cloud.destroy();

    expect(star.destroy).toHaveBeenCalledTimes(1);
    expect(dust.destroy).toHaveBeenCalledTimes(1);
    expect(ubo.destroy).toHaveBeenCalledTimes(1);

    // Idempotent: a second destroy is a no-op (no double-free of the buffers).
    cloud.destroy();
    expect(star.destroy).toHaveBeenCalledTimes(1);
    expect(ubo.destroy).toHaveBeenCalledTimes(1);
  });
});
