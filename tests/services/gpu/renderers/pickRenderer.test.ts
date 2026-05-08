import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import { createPointRenderer } from '../../../../src/services/gpu/renderers/pointRenderer';
import { Source } from '../../../../src/data/sources';

beforeAll(() => {
  // Same WebGPU global stubs the other gpu tests use; mirror their pattern.
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUTextureUsage ??= {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
  g.GPUBufferUsage ??= {
    MAP_READ: 0x01,
    COPY_SRC: 0x04,
    COPY_DST: 0x08,
    UNIFORM: 0x40,
    VERTEX: 0x20,
  };
  g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
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

describe('createPickRenderer', () => {
  it('takes a PointRenderer at construction (no per-call uniformBuffer arg)', () => {
    const device = makeStubDevice();
    const pointRenderer = createPointRenderer(device, 'rgba16float');
    const pickRenderer = createPickRenderer(device, pointRenderer);

    // The compile-time test is the strongest one: this file would fail
    // to typecheck if `createPickRenderer` still required only a device
    // (or if `pick()` still wanted a sharedUniformBuffer arg).  Runtime
    // assertion is a sanity check that construction returned a usable
    // handle.
    expect(pickRenderer).toBeDefined();
    expect(typeof pickRenderer.pick).toBe('function');
    expect(typeof pickRenderer.destroy).toBe('function');
  });

  it('builds @group(1) bind groups against its OWN pipeline layout (regression: cross-pipeline auto-layout incompatibility)', async () => {
    // ── Why this test exists ──────────────────────────────────────────
    //
    // The (source, localIdx) packing refactor moved `cloud.sourceCode`
    // into a `@group(1)` uniform that the SHARED vertex stage reads.
    // Both PointRenderer and PickRenderer compile from the same WGSL
    // and use `layout: 'auto'`.  WebGPU's auto-derived bind-group
    // layouts are pipeline-specific identities — sharing one bind
    // group across two `auto` pipelines fails the "group-equivalent"
    // compatibility check at draw time:
    //
    //   "BindGroup uses a BindGroupLayout that was not created by the
    //    pipeline.  Either use the bind group layout returned by
    //    getBindGroupLayout(1) on the pipeline when creating the bind
    //    group, or provide an explicit pipeline layout when creating
    //    the pipeline."
    //
    // The fix: PickRenderer must build its OWN per-source `@group(1)`
    // bind groups against its OWN `pipeline.getBindGroupLayout(1)`,
    // sharing only the underlying `GPUBuffer` with PointRenderer.
    //
    // This test asserts the contract by:
    //   1. Tagging each pipeline's auto-derived layouts with its index.
    //      PointRenderer creates pipeline 0, PickRenderer creates 1.
    //   2. Calling `pick()` with two distinct cloudFadeBuffers.
    //   3. Asserting every `createBindGroup` for group(1) uses
    //      pipeline-1's g1 layout — never pipeline-0's.

    const layoutsByPipeline: Array<{ g0: object; g1: object }> = [];
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
      createRenderPipeline: vi.fn(() => {
        const idx = layoutsByPipeline.length;
        const layouts = {
          g0: { __pipeline: idx, __group: 0 },
          g1: { __pipeline: idx, __group: 1 },
        };
        layoutsByPipeline.push(layouts);
        return {
          getBindGroupLayout: (i: number) => (i === 0 ? layouts.g0 : layouts.g1),
        };
      }),
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

    // PointRenderer first → pipeline index 0; PickRenderer → index 1.
    const pointRenderer = createPointRenderer(device, 'rgba16float');
    const pickRenderer = createPickRenderer(device, pointRenderer);

    expect(layoutsByPipeline).toHaveLength(2);
    const pickG1 = layoutsByPipeline[1]!.g1;
    const pointG1 = layoutsByPipeline[0]!.g1;

    // Two distinct cloudFadeBuffers — the production case is N visible
    // surveys and we want both bind groups to be built.
    const fadeBufA = { __fade: 'A' } as unknown as GPUBuffer;
    const fadeBufB = { __fade: 'B' } as unknown as GPUBuffer;
    const vbA = { __vb: 'A' } as unknown as GPUBuffer;
    const vbB = { __vb: 'B' } as unknown as GPUBuffer;

    await pickRenderer.pick([100, 100], 50, 50, [
      { source: Source.SDSS, vertexBuffer: vbA, count: 10, cloudFadeBuffer: fadeBufA },
      { source: Source.TwoMRS, vertexBuffer: vbB, count: 20, cloudFadeBuffer: fadeBufB },
    ]);

    // Every `createBindGroup` call for group(1) must use PickRenderer's
    // own layout (pickG1).  If a future change forwards PointRenderer's
    // bindGroup directly (the bug this test guards against), no
    // `createBindGroup` call would carry pickG1 and the assertion fails.
    const group1Calls = createBindGroupCalls.filter((c) => c.layout === pickG1);
    expect(group1Calls).toHaveLength(2);
    expect(group1Calls.map((c) => c.buffer)).toEqual([fadeBufA, fadeBufB]);

    // Negative assertion: NO group(1) bind group was built against
    // PointRenderer's layout.  This is the structural complement —
    // ensures the test isn't trivially passing because both layouts
    // happened to compare equal.
    const wrongLayoutCalls = createBindGroupCalls.filter((c) => c.layout === pointG1);
    expect(wrongLayoutCalls).toHaveLength(0);
  });
});
