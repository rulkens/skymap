import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import {
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
  PICK_PASS_BYTE_OFFSET,
  UNIFORM_BYTES,
} from '../../../../src/services/gpu/renderers/pointRenderer';
import { SELECTION_NONE_SENTINEL } from '../../../../src/data/selectionEncoding';
import { Source } from '../../../../src/data/sources';
import type { MilkyWayPickRenderer } from '../../../../src/@types/rendering/MilkyWayPickRenderer';

beforeAll(() => {
  // GPUBufferUsage / GPUShaderStage / GPUTextureUsage come from the
  // shared `tests/setup/webgpuGlobals.ts` setupFile. GPUMapMode is only
  // used by pickRenderer's read-back path, so it stays local.
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUMapMode ??= { READ: 1, WRITE: 2 };
});

// A minimal stub device with a tracked writeBuffer — allows assertions
// about which buffer was targeted and at which byte offset.
function makeStubDevice() {
  const writeBufferCalls: Array<{
    buffer: unknown;
    offset: number;
    data: ArrayBuffer | ArrayBufferView;
  }> = [];

  const device = {
    // PickRenderer routes shader-module creation through
    // `createShaderModuleWithDevLog`, which calls `getCompilationInfo()`
    // under `import.meta.env.DEV` (true in Vitest).  Stub it out with a
    // Promise-returning empty-messages response.
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
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
    queue: {
      writeBuffer: vi.fn((buffer: unknown, offset: number, data: ArrayBuffer | ArrayBufferView) => {
        writeBufferCalls.push({ buffer, offset, data });
      }),
      submit: vi.fn(),
    },
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
  };

  return { device: device as unknown as GPUDevice, writeBufferCalls };
}

// A drivable device: staging buffer has mapAsync / getMappedRange / unmap so
// pick() can complete its async readback path.  raw=0 → clean null (no hit).
function makeDrivableDevice() {
  let ownPickBuffer: unknown = null; // captured from the first createBuffer call

  const writeBufferCalls: Array<{
    buffer: unknown;
    offset: number;
    data: ArrayBuffer | ArrayBufferView;
  }> = [];

  let createBufferCallCount = 0;

  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
    createBuffer: vi.fn((desc?: { label?: string }) => {
      createBufferCallCount++;
      const buf = {
        mapAsync: vi.fn(() => Promise.resolve()),
        getMappedRange: vi.fn(() => new Uint32Array([0]).buffer),
        unmap: vi.fn(),
        destroy: vi.fn(),
        __id: createBufferCallCount,
        __label: desc?.label ?? '',
      };
      // The pick uniform buffer is labelled 'pick-uniform-buffer' — capture
      // it by label rather than by call order so the assertion is resilient
      // to future reordering of factory allocations.
      if (desc?.label === 'pick-uniform-buffer') {
        ownPickBuffer = buf;
      }
      return buf;
    }),
    createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
    queue: {
      writeBuffer: vi.fn((buffer: unknown, offset: number, data: ArrayBuffer | ArrayBufferView) => {
        writeBufferCalls.push({ buffer, offset, data });
      }),
      submit: vi.fn(),
    },
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
  };

  return {
    device: device as unknown as GPUDevice,
    writeBufferCalls,
    getOwnPickBuffer: () => ownPickBuffer,
  };
}

// Stub BGLs — PickRenderer requires fadeBgl + sourceBgl + focusBgl as
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
// The shared lensing buffer is embedded at @group(0) @binding(1); the pick
// renderer only references it, never introspects it.
function makeStubLensingBuffer() {
  return {} as unknown as GPUBuffer;
}

// A minimal dummy uniform bytes buffer for pick() calls.
function makeUniformBytes(): ArrayBuffer {
  return new ArrayBuffer(UNIFORM_BYTES);
}

describe('createPickRenderer', () => {
  it('no longer takes a PointRenderer at construction — factory accepts device + BGLs only', () => {
    // This test is primarily a compile-time contract: the call below must
    // type-check without a PointRenderer argument.  The runtime check is
    // that the returned handle is usable.
    //
    // Previously, `createPickRenderer(device, pointRenderer, fadeBgl, ...)`
    // required a live PointRenderer so it could steal its uniform buffer.
    // After this task, the factory owns its own pickUniformBuffer; callers
    // pass the packed bytes per-call.
    const { device } = makeStubDevice();
    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
    );

    expect(pickRenderer).toBeDefined();
    expect(typeof pickRenderer.pick).toBe('function');
    expect(typeof pickRenderer.destroy).toBe('function');
  });

  it('DECOUPLING REGRESSION: writeBuffer targets the OWN pick buffer only — never an external buffer', async () => {
    // Why this test exists:
    //
    // Before this task, `recordPickPass` called
    // `pointRenderer.uniformBuffer` and wrote the three pick-specific
    // fields directly onto the visual renderer's GPU buffer.  The visual
    // frame was required to undo that damage on the next tick — two
    // writers on one buffer, with cleanup delegated to an unrelated
    // subsystem.
    //
    // This test proves the invariant is gone: every `writeBuffer` call
    // made by `pick()` targets the renderer's OWN pickUniformBuffer, and
    // the buffer it writes is the same object the factory allocated (the
    // first `createBuffer` call).  No external buffer passed by the caller
    // is ever written.
    const { device, writeBufferCalls, getOwnPickBuffer } = makeDrivableDevice();

    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
    );

    const ownPickBuffer = getOwnPickBuffer();
    expect(ownPickBuffer).not.toBeNull();

    // An external buffer that must NEVER be written.
    const externalBuffer = { __external: true } as unknown as GPUBuffer;

    writeBufferCalls.length = 0; // clear construction calls

    const uniformBytes = makeUniformBytes();
    const pointSizePx = 3.5;
    await pickRenderer.pick(
      [100, 100],
      50,
      50,
      [{ source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer }],
      pointSizePx,
      uniformBytes,
    );

    // (a) Every writeBuffer call targets the OWN pick buffer — never the
    // external buffer.
    expect(writeBufferCalls.length).toBeGreaterThan(0);
    for (const call of writeBufferCalls) {
      expect(call.buffer).not.toBe(externalBuffer);
      expect(call.buffer).toBe(ownPickBuffer);
    }

    // (b) Full upload at offset 0 (the base uniformBytes upload).
    const fullUpload = writeBufferCalls.find((c) => c.offset === 0);
    expect(fullUpload).toBeDefined();

    // (c) selectedPacked override at SELECTED_PACKED_BYTE_OFFSET with
    // SELECTION_NONE_SENTINEL.  The data is a Uint32Array (ArrayBufferView).
    const selectedCall = writeBufferCalls.find((c) => c.offset === SELECTED_PACKED_BYTE_OFFSET);
    expect(selectedCall).toBeDefined();
    const selectedView = selectedCall!.data as Uint32Array;
    expect(selectedView[0]).toBe(SELECTION_NONE_SENTINEL);

    // (d) pointSizePx override at POINT_SIZE_BYTE_OFFSET with pointSizePx
    // + PICK_PADDING_PX (4 px).  The data is a Float32Array.
    const sizeCall = writeBufferCalls.find((c) => c.offset === POINT_SIZE_BYTE_OFFSET);
    expect(sizeCall).toBeDefined();
    const sizeView = sizeCall!.data as Float32Array;
    expect(sizeView[0]).toBeCloseTo(pointSizePx + 4);

    // (e) pickPass override at PICK_PASS_BYTE_OFFSET with 1.  The data is
    // a Uint32Array.
    const pickPassCall = writeBufferCalls.find((c) => c.offset === PICK_PASS_BYTE_OFFSET);
    expect(pickPassCall).toBeDefined();
    const pickPassView = pickPassCall!.data as Uint32Array;
    expect(pickPassView[0]).toBe(1);
  });

  it('returns null when there are no pick targets (empty source list + no structure markers)', async () => {
    // pick() returns null without issuing any GPU work when the scene has
    // no pickable objects — a performance gate, not a correctness concern.
    const { device } = makeDrivableDevice();
    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
    );

    const result = await pickRenderer.pick(
      [100, 100],
      50,
      50,
      [], // empty sources
      2.5,
      makeUniformBytes(),
    );

    expect(result).toBeNull();
  });

  it('returns null when a pick is already in flight (deferred mapAsync)', async () => {
    // pick() uses a single staging buffer.  Issuing a second pick before
    // the first mapAsync resolves would try to map an already-mapped buffer
    // (GPU validation error).  The inFlight guard prevents this: the second
    // call returns null immediately.
    let resolveFirstPick!: () => void;
    const firstPickPromise = new Promise<void>((res) => {
      resolveFirstPick = res;
    });

    const device = {
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn(() => ({
        // Staging buffer: mapAsync defers until we resolve the outer promise.
        mapAsync: vi.fn(() => firstPickPromise),
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

    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
    );

    const sources = [
      { source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer },
    ];
    const uniformBytes = makeUniformBytes();

    // First pick — will hang at mapAsync until we resolve.
    const firstPick = pickRenderer.pick([100, 100], 50, 50, sources, 2.5, uniformBytes);

    // Second pick fires before first resolves — must return null.
    const secondResult = await pickRenderer.pick([100, 100], 50, 50, sources, 2.5, uniformBytes);
    expect(secondResult).toBeNull();

    // Unblock the first pick.
    resolveFirstPick();
    const firstResult = await firstPick;
    // raw=0 → unpackPick returns null (background).
    expect(firstResult).toBeNull();
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

    const canonicalSourceBgl = makeStubSourceBgl();
    const canonicalFadeBgl = makeStubFadeBgl();
    const canonicalFocusBgl = makeStubFocusBgl();

    const createBindGroupCalls: Array<{ layout: unknown; buffer: unknown }> = [];

    const device = {
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({
        getBindGroupLayout: (_i: number) => ({}),
      })),
      createBuffer: vi.fn(() => ({
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

    const pickRenderer = createPickRenderer(
      device,
      canonicalFadeBgl,
      canonicalSourceBgl,
      canonicalFocusBgl,
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
    );

    const sourceBufA = { __source: 'A' } as unknown as GPUBuffer;
    const sourceBufB = { __source: 'B' } as unknown as GPUBuffer;
    const vbA = { __vb: 'A' } as unknown as GPUBuffer;
    const vbB = { __vb: 'B' } as unknown as GPUBuffer;

    // Reset call capture after construction (constructors build their own bind groups).
    createBindGroupCalls.length = 0;

    await pickRenderer.pick(
      [100, 100],
      50,
      50,
      [
        { source: Source.SDSS, vertexBuffer: vbA, count: 10, sourceBuffer: sourceBufA },
        { source: Source.TwoMRS, vertexBuffer: vbB, count: 20, sourceBuffer: sourceBufB },
      ],
      2.5,
      makeUniformBytes(),
    );

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
  function makeMwDrivableDevice(): GPUDevice {
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
      pickMilkyWay: vi.fn<(pass: GPURenderPassEncoder, halfExtentPx: number) => void>(),
      destroy: vi.fn<() => void>(),
    };
  }

  it('invokes pickMilkyWay inside the pick pass when the MW is gated visible', async () => {
    const device = makeMwDrivableDevice();
    const mwPick = makeMilkyWayPickRenderer();
    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
      undefined, // no structure markers
      undefined, // no procedural disks
      mwPick,
      () => 24, // MW disk visible — half-extent in px
    );

    await pickRenderer.pick(
      [100, 100],
      50,
      50,
      [{ source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer }],
      2.5,
      makeUniformBytes(),
    );

    expect(mwPick.pickMilkyWay).toHaveBeenCalledTimes(1);
    // The computed half-extent is threaded straight through to the draw.
    expect(mwPick.pickMilkyWay.mock.calls[0]![1]).toBe(24);
  });

  it('does NOT invoke pickMilkyWay when the MW is gated hidden', async () => {
    const device = makeMwDrivableDevice();
    const mwPick = makeMilkyWayPickRenderer();
    const pickRenderer = createPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      makeStubLensingBuffer(),
      {} as unknown as GPUBindGroup,
      undefined,
      undefined,
      mwPick,
      () => null, // MW disk hidden — gate closed
    );

    // A galaxy source is present so the pass still runs; the MW draw must
    // be skipped because the gate is closed.
    await pickRenderer.pick(
      [100, 100],
      50,
      50,
      [{ source: Source.SDSS, vertexBuffer: {} as GPUBuffer, count: 10, sourceBuffer: {} as GPUBuffer }],
      2.5,
      makeUniformBytes(),
    );

    expect(mwPick.pickMilkyWay).not.toHaveBeenCalled();
  });
});
