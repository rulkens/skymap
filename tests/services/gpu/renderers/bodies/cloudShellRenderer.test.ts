import { describe, it, expect, vi } from 'vitest';
import { createCloudShellRenderer } from '../../../../../src/services/gpu/renderers/bodies/cloudShellRenderer';
import { CLOUD_SHELL_UNIFORM_FLOATS } from '../../../../../src/utils/gpu/packCloudShellUniforms';

/**
 * The shell is a CLOSED sphere: `cullMode: 'back'` culls every triangle once
 * the camera moves inside it, with no fallback (Task 10, spec §5c). These
 * tests pin the fix's shape — a second, front-cull pipeline sharing every
 * other pipeline state, selected by `draw`'s `inside` argument — the same
 * discriminant shape `atmosphereShellRenderer`'s inside/outside pair uses.
 * `mockDevice()` mirrors that suite's harness (see
 * `tests/services/gpu/renderers/atmosphere/atmosphereShellRenderer.test.ts`).
 */

type Harness = {
  device: GPUDevice;
  renderPipelines: GPURenderPipelineDescriptor[];
  descOf: Map<unknown, GPURenderPipelineDescriptor>;
};

function mockDevice(): Harness {
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const descOf = new Map<unknown, GPURenderPipelineDescriptor>();
  const device = {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
      // generateMipChain reads these off the texture.
      mipLevelCount: desc.mipLevelCount ?? 1,
      format: desc.format,
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      const handle = {};
      descOf.set(handle, desc);
      return handle;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;
  return { device, renderPipelines, descOf };
}

function build() {
  const h = mockDevice();
  const renderer = createCloudShellRenderer(h.device, 'rgba16float', 'depth32float', true);
  return { ...h, renderer };
}

describe('createCloudShellRenderer — outside/inside pipeline pair', () => {
  it('builds two shell pipelines identical except cullMode', () => {
    const { renderPipelines } = build();
    expect(renderPipelines).toHaveLength(2);
    const [outside, inside] = renderPipelines as [
      GPURenderPipelineDescriptor,
      GPURenderPipelineDescriptor,
    ];
    expect(inside.vertex).toEqual(outside.vertex);
    expect(inside.fragment).toEqual(outside.fragment);
    expect(inside.depthStencil).toEqual(outside.depthStencil);
    expect(inside.layout).toBe(outside.layout);
    expect(outside.primitive!.cullMode).toBe('back');
    expect(inside.primitive!.cullMode).toBe('front');
  });

  it('draws with the front-cull pipeline when inside, back-cull when outside', () => {
    const { descOf, renderer } = build();
    const cullModeOf = (p: unknown): GPUCullMode | undefined => descOf.get(p)?.primitive?.cullMode;
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.draw(pass, new Float32Array(CLOUD_SHELL_UNIFORM_FLOATS), false);
    renderer.draw(pass, new Float32Array(CLOUD_SHELL_UNIFORM_FLOATS), true);

    const setPipelineSpy = pass.setPipeline as unknown as ReturnType<typeof vi.fn>;
    expect(cullModeOf(setPipelineSpy.mock.calls[0]![0])).toBe('back');
    expect(cullModeOf(setPipelineSpy.mock.calls[1]![0])).toBe('front');
  });

  // The shell's map is a second full copy of Earth's clouds; release must free it
  // while keeping a transparent stand-in bound.
  it('clearTexture destroys the map and rebinds the transparent placeholder', () => {
    const { device, renderer } = build();
    const created = (device.createTexture as unknown as ReturnType<typeof vi.fn>).mock.results;
    renderer.setTexture({ width: 4, height: 2 } as unknown as ImageBitmap);
    const placeholder = created[0]!.value;
    const map = created.at(-1)!.value;

    renderer.clearTexture();

    expect(map.destroy).toHaveBeenCalledOnce();
    expect(placeholder.destroy).not.toHaveBeenCalled();
    const bindGroups = (device.createBindGroup as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastEntries = bindGroups.at(-1)![0].entries as GPUBindGroupEntry[];
    expect(lastEntries.find((e) => e.binding === 2)!.resource).toBe(
      placeholder.createView.mock.results.at(-1)!.value,
    );
  });
});
