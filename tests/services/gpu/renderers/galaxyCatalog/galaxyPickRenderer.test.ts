import { describe, expect, it, vi } from 'vitest';
import { createGalaxyPickRenderer } from '../../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPickRenderer';
import { UNIFORM_BYTES } from '../../../../../src/services/gpu/renderers/galaxyCatalog/galaxyPointVertexLayout';
import { Source } from '../../../../../src/data/sources';

// A minimal stub device with a tracked writeBuffer — allows assertions
// about which buffer was targeted and at which byte offset.  `createBuffer`
// captures the pick uniform buffer by label so the OWN-buffer assertions are
// resilient to reordering of factory allocations.
function makeStubDevice() {
  let ownPickBuffer: unknown = null;

  const writeBufferCalls: Array<{
    buffer: unknown;
    offset: number;
    data: ArrayBuffer | ArrayBufferView;
  }> = [];

  const device = {
    // GalaxyPickRenderer routes shader-module creation through
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
    createBuffer: vi.fn((desc?: { label?: string }) => {
      const buf = { destroy: vi.fn(), __label: desc?.label ?? '' };
      if (desc?.label === 'pick-uniform-buffer') ownPickBuffer = buf;
      return buf;
    }),
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
    createBindGroup: vi.fn(),
  };

  return {
    device: device as unknown as GPUDevice,
    writeBufferCalls,
    getOwnPickBuffer: () => ownPickBuffer,
  };
}

// Stub BGLs — GalaxyPickRenderer requires fadeBgl + sourceBgl + focusBgl as
// canonical shared layouts.
function makeStubFadeBgl() {
  return {} as import('../../../../../src/@types/rendering/FadeUniformsBgl').FadeUniformsBgl;
}
function makeStubSourceBgl() {
  return {} as import('../../../../../src/@types/rendering/SourceUniformsBgl').SourceUniformsBgl;
}
function makeStubFocusBgl() {
  return {} as import('../../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl;
}

// A minimal dummy uniform bytes buffer for drawPoints calls.
function makeUniformBytes(): ArrayBuffer {
  return new ArrayBuffer(UNIFORM_BYTES);
}

// A stub render pass encoder that records setBindGroup / draw calls.
function makeStubPass() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

describe('createGalaxyPickRenderer', () => {
  it('constructs from device + BGLs + focus bind group only, exposing the draw surface', () => {
    // The picker owns its own pickUniformBuffer; callers pass the packed
    // bytes per `drawPoints` call.  The public surface is the slimmed
    // point-pick draw provider: `drawPoints`, `bindCamera`, `destroy`.
    const { device } = makeStubDevice();
    const galaxyPickRenderer = createGalaxyPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      false,
    );

    expect(galaxyPickRenderer).toBeDefined();
    expect(typeof galaxyPickRenderer.drawPoints).toBe('function');
    expect(typeof galaxyPickRenderer.bindCamera).toBe('function');
    expect(typeof galaxyPickRenderer.destroy).toBe('function');
  });

  it('drawPoints uploads the caller bytes VERBATIM to its OWN buffer — no post-upload patching', () => {
    // drawPoints is the point-pick draw surface: it uploads the caller's
    // already-pick-shaped uniform bytes to the renderer's OWN pickUniformBuffer
    // and does nothing else to it. The pick byte-shaping (sentinel, padded
    // size, pickPass=1) lives in `pickUniformBytesOf`, so there are NO
    // post-upload overrides here. Two decoupling invariants asserted together:
    //   1. a single writeBuffer at offset 0 (verbatim upload, no patch writes);
    //   2. it targets the OWN buffer — the visual pass's buffer is never touched.
    const { device, writeBufferCalls, getOwnPickBuffer } = makeStubDevice();
    const galaxyPickRenderer = createGalaxyPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      false,
    );

    const ownPickBuffer = getOwnPickBuffer();
    expect(ownPickBuffer).not.toBeNull();

    writeBufferCalls.length = 0; // clear construction calls

    const uniformBytes = makeUniformBytes();
    galaxyPickRenderer.drawPoints(
      makeStubPass(),
      [
        {
          source: Source.SDSS,
          vertexBuffer: {} as GPUBuffer,
          count: 10,
          sourceBuffer: {} as GPUBuffer,
        },
      ],
      uniformBytes,
    );

    // Exactly one writeBuffer: the verbatim upload at offset 0 to the OWN
    // buffer, carrying the caller's bytes unchanged.
    expect(writeBufferCalls).toHaveLength(1);
    expect(writeBufferCalls[0]!.offset).toBe(0);
    expect(writeBufferCalls[0]!.buffer).toBe(ownPickBuffer);
    expect(writeBufferCalls[0]!.data).toBe(uniformBytes);
  });

  it('bindCamera re-binds @group(0) to the pick uniform bind group', () => {
    // bindCamera is the narrow restore surface a disk/ring drawPick calls
    // after clobbering slot 0: it must bind the SAME @group(0) bind group the
    // factory built against pickUniformBuffer (labelled 'pick-uniform-bg').
    const createBindGroupByLabel = new Map<string, unknown>();
    const device = {
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createBindGroupLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
      createBindGroup: vi.fn((desc: { label?: string }) => {
        const bg = { __label: desc.label };
        createBindGroupByLabel.set(desc.label ?? '', bg);
        return bg;
      }),
    } as unknown as GPUDevice;

    const galaxyPickRenderer = createGalaxyPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      false,
    );

    const pickUniformBindGroup = createBindGroupByLabel.get('pick-uniform-bg');
    expect(pickUniformBindGroup).toBeDefined();

    const setBindGroup = vi.fn();
    const pass = { setBindGroup } as unknown as GPURenderPassEncoder;
    galaxyPickRenderer.bindCamera(pass);

    expect(setBindGroup).toHaveBeenCalledTimes(1);
    expect(setBindGroup).toHaveBeenCalledWith(0, pickUniformBindGroup);
  });

  it('drawPoints uploads the camera uniform and binds @group(0) even with zero sources', () => {
    // Load-bearing prefix contract: a sibling drawPick that reads the point
    // pick uniform via the @group(0) CameraUniforms prefix relies on this draw
    // binding it.  So drawPoints MUST upload the camera uniform and bind
    // @group(0) even when there are ZERO galaxy sources to draw — otherwise a
    // galaxy-empty scene would leave slot 0 unbound (or stale) for the
    // fold-ins that follow.
    const { device, writeBufferCalls, getOwnPickBuffer } = makeStubDevice();
    const galaxyPickRenderer = createGalaxyPickRenderer(
      device,
      makeStubFadeBgl(),
      makeStubSourceBgl(),
      makeStubFocusBgl(),
      {} as unknown as GPUBindGroup,
      false,
    );

    const ownPickBuffer = getOwnPickBuffer();
    expect(ownPickBuffer).not.toBeNull();

    writeBufferCalls.length = 0; // clear construction calls

    const bindGroupCalls: Array<{ index: number; group: unknown }> = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn((index: number, group: unknown) => bindGroupCalls.push({ index, group })),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    galaxyPickRenderer.drawPoints(pass, [], makeUniformBytes());

    // Camera uniform uploaded at offset 0 to the OWN buffer — no sources needed.
    const fullUpload = writeBufferCalls.find((c) => c.offset === 0);
    expect(fullUpload).toBeDefined();
    expect(fullUpload!.buffer).toBe(ownPickBuffer);

    // @group(0) bound — the prefix a sibling drawPick depends on.
    expect(bindGroupCalls.some((c) => c.index === 0)).toBe(true);

    // Zero sources → no per-source draws.
    expect(pass.draw as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('builds @group(2) source bind groups against the CANONICAL sourceBgl layout (regression: cross-pipeline auto-layout incompatibility)', () => {
    // ── Why this test exists ──────────────────────────────────────────
    //
    // GalaxyPointRenderer and GalaxyPickRenderer use an explicit pipelineLayout with
    // shared canonical BGLs for @group(1) (FadeUniforms) and @group(2)
    // (SourceUniforms). Both declare the SAME canonical layout, so bind
    // groups built against it are valid for either pipeline — WebGPU's
    // auto-derived layouts are pipeline-specific and would not be.
    //
    // The contract, asserted below:
    //   1. Pass a single canonical sourceBgl to the renderer.
    //   2. Call `drawPoints` with two distinct sourceBuffers.
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
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
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

    const galaxyPickRenderer = createGalaxyPickRenderer(
      device,
      canonicalFadeBgl,
      canonicalSourceBgl,
      canonicalFocusBgl,
      {} as unknown as GPUBindGroup,
      false,
    );

    const sourceBufA = { __source: 'A' } as unknown as GPUBuffer;
    const sourceBufB = { __source: 'B' } as unknown as GPUBuffer;
    const vbA = { __vb: 'A' } as unknown as GPUBuffer;
    const vbB = { __vb: 'B' } as unknown as GPUBuffer;

    // Reset call capture after construction (constructors build their own bind groups).
    createBindGroupCalls.length = 0;

    galaxyPickRenderer.drawPoints(
      makeStubPass(),
      [
        { source: Source.SDSS, vertexBuffer: vbA, count: 10, sourceBuffer: sourceBufA },
        { source: Source.TwoMRS, vertexBuffer: vbB, count: 20, sourceBuffer: sourceBufB },
      ],
      makeUniformBytes(),
    );

    // Every @group(2) `createBindGroup` call against the canonical sourceBgl
    // must use the two sourceBuffers.  The layout identity is the canonical
    // sourceBgl object passed at construction — not an auto-derived
    // per-pipeline layout.
    const sourceGroup2Calls = createBindGroupCalls.filter((c) => c.layout === canonicalSourceBgl);
    expect(sourceGroup2Calls).toHaveLength(2);
    expect(sourceGroup2Calls.map((c) => c.buffer)).toEqual([sourceBufA, sourceBufB]);
  });
});
