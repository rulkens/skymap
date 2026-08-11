import { describe, it, expect, vi } from 'vitest';
import { createMilkyWayPickRenderer } from '../../../../../src/services/gpu/renderers/milkyWay/milkyWayPickRenderer';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import { MILKY_WAY_RADIUS_MPC } from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { Source } from '../../../../../src/data/sources';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';

// Null-device pattern, mirrors structureMarkerRenderer.test.ts.  The GPU-
// backed pick round-trip (a click at the galactic centre decodes to
// Source.MilkyWay) is covered by the DoD manual smoke test — the existing
// pick-renderer harness exercises only the null/stub device, so a
// decode-from-texture unit test is not feasible here.
const newRenderer = () => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createMilkyWayPickRenderer(ctx, null as unknown as FadeUniformsBgl, false);
};

// Stub device with a tracked writeBuffer — lets the construction test
// assert exactly what lands in the @group(2) uniform.  Same shape as the
// pickRenderer.test.ts stubs (GPUBufferUsage / GPUShaderStage globals come
// from the shared tests/setup/webgpuGlobals.ts setupFile).
function makeStubDevice() {
  const writeBufferCalls: Array<{
    buffer: unknown;
    offset: number;
    data: ArrayBuffer | ArrayBufferView;
  }> = [];

  const device = {
    // createShaderModuleWithDevLog calls getCompilationInfo() under
    // import.meta.env.DEV (true in Vitest).
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    queue: {
      writeBuffer: vi.fn((buffer: unknown, offset: number, data: ArrayBuffer | ArrayBufferView) => {
        writeBufferCalls.push({ buffer, offset, data });
      }),
      submit: vi.fn(),
    },
  };

  return { device: device as unknown as GPUDevice, writeBufferCalls };
}

function makeStubPass(): GPURenderPassEncoder & { draw: ReturnType<typeof vi.fn> } {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder & { draw: ReturnType<typeof vi.fn> };
}

describe('milkyWayPickRenderer (null device)', () => {
  it('constructs under a null device', () => {
    const r = newRenderer();
    expect(r).toBeDefined();
    // pickMilkyWay / destroy are callable no-ops with no GPU device.
    expect(() =>
      r.pickMilkyWay(null as unknown as GPURenderPassEncoder, new ArrayBuffer(176)),
    ).not.toThrow();
    expect(() => r.destroy()).not.toThrow();
  });
});

describe('milkyWayPickRenderer (stub device)', () => {
  it('writes the FULLY STATIC uniform once at construction: centre + source code + radiusMpc', () => {
    // The @group(2) uniform carries only physical scene constants — the
    // apparent size is derived in the vertex shader from the caller's
    // camera uniforms — so ONE construction-time write must cover the
    // buffer's whole lifetime.
    const { device, writeBufferCalls } = makeStubDevice();
    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    createMilkyWayPickRenderer(ctx, {} as FadeUniformsBgl, false);

    expect(writeBufferCalls).toHaveLength(1);
    const { offset, data } = writeBufferCalls[0]!;
    expect(offset).toBe(0);

    const bytes = data as ArrayBuffer;
    expect(bytes.byteLength).toBe(32);
    const f32 = new Float32Array(bytes);
    const u32 = new Uint32Array(bytes);
    // vec3 centre at bytes 0..11.
    expect(f32[0]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0]);
    expect(f32[1]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1]);
    expect(f32[2]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2]);
    // u32 source code at byte 12.
    expect(u32[3]).toBe(Source.MilkyWay);
    // f32 disc world radius at byte 16 — the value the vertex shader
    // projects to apparent pixels.
    expect(f32[4]).toBeCloseTo(MILKY_WAY_RADIUS_MPC);
  });

  it('pickMilkyWay self-binds @group(0): uploads the caller bytes to its OWN camera buffer', () => {
    // The NEAR0 pick pass carries no shared point-sprites slot-0 prefix (that
    // is a COSMO-pass contract), so pickMilkyWay must upload the caller's
    // complete pick image to its own buffer and bind @group(0) itself rather
    // than inherit a camera. Reverting to an inherited-camera pattern (no
    // upload, no slot-0 bind) leaves the pass with an unbound camera group —
    // a validation error that silently drops the whole pick submit.
    const { device, writeBufferCalls } = makeStubDevice();
    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    const r = createMilkyWayPickRenderer(ctx, {} as FadeUniformsBgl, false);

    writeBufferCalls.length = 0; // discard the construction write
    const pass = makeStubPass();
    const uniformBytes = new ArrayBuffer(176);
    r.pickMilkyWay(pass, uniformBytes);

    // Exactly one upload — the caller's bytes, verbatim, at offset 0.
    expect(writeBufferCalls).toHaveLength(1);
    expect(writeBufferCalls[0]!.offset).toBe(0);
    expect(writeBufferCalls[0]!.data).toBe(uniformBytes);

    // Slot 0 is bound by THIS draw (self-bind), alongside the dummy fade (1)
    // and the static MW uniform (2).
    const setBindGroup = pass.setBindGroup as unknown as ReturnType<typeof vi.fn>;
    const slots = setBindGroup.mock.calls.map((c) => c[0]);
    expect(slots).toContain(0);
    expect(slots).toContain(1);
    expect(slots).toContain(2);
    expect(pass.draw).toHaveBeenCalledWith(6, 1);
  });
});
