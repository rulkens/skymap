import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import { createPointRenderer } from '../../../../src/services/gpu/renderers/pointRenderer';
import { Source } from '../../../../src/data/sources';
import type { MilkyWayPickRenderer } from '../../../../src/@types/rendering/MilkyWayPickRenderer';

beforeAll(() => {
  // GPUBufferUsage / GPUShaderStage / GPUTextureUsage come from the
  // shared `tests/setup/webgpuGlobals.ts` setupFile. GPUMapMode is only
  // used by pickRenderer's read-back path, so it stays local.
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUMapMode ??= { READ: 1, WRITE: 2 };
});

function makeStubDevice(): GPUDevice {
  // Minimal stub — enough for createPickRenderer construction.
  return {
    // PickRenderer + PointRenderer route shader-module creation through
    // `createShaderModuleWithDevLog`, which calls `getCompilationInfo()`
    // under `import.meta.env.DEV` (true by default in Vitest).  Stub it
    // out with a Promise-returning empty-messages response so the
    // helper's `void module.getCompilationInfo()` doesn't throw.
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    // Explicit pipelineLayout construction requires these two methods on the
    // device.  Both return sentinel objects that satisfy the structural types.
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: () => ({}),
    })),
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
    })),
    createTexture: vi.fn(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    })),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: () => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      }),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn(),
    })),
    createBindGroup: vi.fn(),
  } as unknown as GPUDevice;
}

// Stub BGLs — both renderers require fadeBgl + sourceBgl + focusBgl as
// canonical shared layouts.
function makeStubFadeBgl() {
  return {} as import('../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}
function makeStubFocusBgl() {
  return {} as import('../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl;
}

describe('createPickRenderer', () => {
  it('takes a PointRenderer at construction (no per-call uniformBuffer arg)', () => {
    const device = makeStubDevice();
    const pointRenderer = createPointRenderer(device, 'rgba16float', makeStubFadeBgl(), makeStubSourceBgl(), makeStubFocusBgl());
    const pickRenderer = createPickRenderer(device, pointRenderer, makeStubFadeBgl(), makeStubSourceBgl(), makeStubFocusBgl(), {} as unknown as GPUBindGroup);

    // The compile-time check is the strongest part: this file fails to
    // typecheck if `createPickRenderer` doesn't take a PointRenderer (or
    // if `pick()` wants a sharedUniformBuffer arg). The runtime assertion
    // is just a sanity check that construction returned a usable handle.
    expect(pickRenderer).toBeDefined();
    expect(typeof pickRenderer.pick).toBe('function');
    expect(typeof pickRenderer.destroy).toBe('function');
  });

  it('builds @group(2) source bind groups against the CANONICAL sourceBgl layout (regression: cross-pipeline auto-layout incompatibility)', async () => {
    // ── Why this test exists ──────────────────────────────────────────
    //
    // PointRenderer and PickRenderer use an explicit pipelineLayout with
    // shared canonical BGLs for @group(1) (FadeUniforms) and @group(2)
    // (SourceUniforms). Both declare the SAME canonical layout, so bind
    // groups built against it are valid for either pipeline — WebGPU's
    // auto-derived layouts are pipeline-specific and would not be.
    //
    // The contract, asserted below:
    //   1. Pass a single canonical sourceBgl to both renderers.
    //   2. Call `pick()` with two distinct sourceBuffers.
    //   3. Every @group(2) `createBindGroup` call uses that canonical
    //      sourceBgl — never a per-pipeline auto-derived layout.

    // The canonical sourceBgl is a shared object — the same identity
    // passed to both createPointRenderer and createPickRenderer.
    const canonicalSourceBgl = makeStubSourceBgl();
    const canonicalFadeBgl = makeStubFadeBgl();
    const canonicalFocusBgl = makeStubFocusBgl();

    const createBindGroupCalls: Array<{ layout: unknown; buffer: unknown }> = [];

    const device = {
      // PickRenderer + PointRenderer both route shader-module creation
      // through `createShaderModuleWithDevLog`, which calls
      // `getCompilationInfo()` when `import.meta.env.DEV` is true
      // (Vitest's default).  The stub therefore must expose a
      // Promise-returning `getCompilationInfo` so the helper doesn't
      // throw on construction.
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      // Explicit pipelineLayout methods — return sentinels.
      createPipelineLayout: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({
        getBindGroupLayout: (_i: number) => ({}),
      })),
      createBuffer: vi.fn(() => ({
        // Staging buffer needs mapAsync / getMappedRange / unmap to drive
        // pick() to completion; we return raw=0 so the result is a clean
        // null (no hit) — the assertions don't depend on the readback.
        mapAsync: vi.fn(() => Promise.resolve()),
        getMappedRange: vi.fn(() => new Uint32Array([0]).buffer),
        unmap: vi.fn(),
        destroy: vi.fn(),
      })),
      createTexture: vi.fn(() => ({
        createView: () => ({}),
        destroy: vi.fn(),
      })),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: () => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          setVertexBuffer: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        }),
        copyTextureToBuffer: vi.fn(),
        finish: vi.fn(() => ({})),
      })),
      createBindGroup: vi.fn(
        (desc: { layout: unknown; entries: Array<{ resource: { buffer: unknown } }> }) => {
          createBindGroupCalls.push({
            layout: desc.layout,
            buffer: desc.entries[0]!.resource.buffer,
          });
          return {};
        },
      ),
    } as unknown as GPUDevice;

    // Both renderers share the same canonical fadeBgl + sourceBgl.
    const pointRenderer = createPointRenderer(device, 'rgba16float', canonicalFadeBgl, canonicalSourceBgl, canonicalFocusBgl);
    const pickRenderer = createPickRenderer(device, pointRenderer, canonicalFadeBgl, canonicalSourceBgl, canonicalFocusBgl, {} as unknown as GPUBindGroup);

    // Two distinct sourceBuffers — the production case is N visible
    // galaxy catalogs and we want one bind group per source.
    const sourceBufA = { __source: 'A' } as unknown as GPUBuffer;
    const sourceBufB = { __source: 'B' } as unknown as GPUBuffer;
    const vbA = { __vb: 'A' } as unknown as GPUBuffer;
    const vbB = { __vb: 'B' } as unknown as GPUBuffer;

    // Reset call capture after construction (constructors build their own bind groups).
    createBindGroupCalls.length = 0;

    await pickRenderer.pick([100, 100], 50, 50, [
      { source: Source.SDSS, vertexBuffer: vbA, count: 10, sourceBuffer: sourceBufA },
      { source: Source.TwoMRS, vertexBuffer: vbB, count: 20, sourceBuffer: sourceBufB },
    ]);

    // Every `createBindGroup` call against the canonical sourceBgl must
    // use the two sourceBuffers.  The layout identity is the canonical
    // sourceBgl object passed at construction — not an auto-derived
    // per-pipeline layout.
    const sourceGroup2Calls = createBindGroupCalls.filter((c) => c.layout === canonicalSourceBgl);
    expect(sourceGroup2Calls).toHaveLength(2);
    expect(sourceGroup2Calls.map((c) => c.buffer)).toEqual([sourceBufA, sourceBufB]);
  });

  // Device that fully drives pick() to completion (staging buffer has
  // mapAsync / getMappedRange / unmap); raw=0 so the readback is a clean
  // null — the MW assertions don't depend on the decode.
  function makeDrivableDevice(): GPUDevice {
    return {
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn(() => ({
        mapAsync: vi.fn(() => Promise.resolve()),
        getMappedRange: vi.fn(() => new Uint32Array([0]).buffer),
        unmap: vi.fn(),
        destroy: vi.fn(),
      })),
      createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: () => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          setVertexBuffer: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        }),
        copyTextureToBuffer: vi.fn(),
        finish: vi.fn(() => ({})),
      })),
      createBindGroup: vi.fn(() => ({})),
    } as unknown as GPUDevice;
  }

  function makeMilkyWayPickRenderer(): MilkyWayPickRenderer & {
    pickMilkyWay: ReturnType<typeof vi.fn>;
  } {
    return {
      label: 'milkyWayPickRenderer',
      pickMilkyWay: vi.fn<(pass: GPURenderPassEncoder) => void>(),
      destroy: vi.fn<() => void>(),
    };
  }

  it('invokes pickMilkyWay inside the pick pass when the MW is gated visible', async () => {
    const device = makeDrivableDevice();
    const pointRenderer = createPointRenderer(
      device,
      'rgba16float',
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
    );
    const mwPick = makeMilkyWayPickRenderer();
    const pickRenderer = createPickRenderer(
      device,
      pointRenderer,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      undefined, // no structure markers
      undefined, // no procedural disks
      mwPick,
      () => true, // MW disk visible
    );

    await pickRenderer.pick([100, 100], 50, 50, [
      { source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer },
    ]);

    expect(mwPick.pickMilkyWay).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke pickMilkyWay when the MW is gated hidden', async () => {
    const device = makeDrivableDevice();
    const pointRenderer = createPointRenderer(
      device,
      'rgba16float',
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
    );
    const mwPick = makeMilkyWayPickRenderer();
    const pickRenderer = createPickRenderer(
      device,
      pointRenderer,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      undefined,
      undefined,
      mwPick,
      () => false, // MW disk hidden — gate closed
    );

    // A galaxy source is present so the pass still runs; the MW draw must
    // be skipped because the gate is closed.
    await pickRenderer.pick([100, 100], 50, 50, [
      { source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer },
    ]);

    expect(mwPick.pickMilkyWay).not.toHaveBeenCalled();
  });
});
