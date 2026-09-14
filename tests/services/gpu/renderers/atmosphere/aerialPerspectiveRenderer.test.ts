import { describe, it, expect, vi } from 'vitest';
import { createAerialPerspectiveRenderer } from '../../../../../src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../../src/utils/gpu/packAtmosphereUniforms';

/**
 * The apply is a full-screen MULTIPLY/ADD pair over a pass that carries NO depth
 * attachment and binds scene depth as a texture instead. The failures pinned
 * here are the ones nothing else catches and the browser reports late or not at
 * all: a depth state that makes the pipeline invalid against that pass, the two
 * draws reordered (ADD first attenuates this pass's own in-scatter), the two
 * entry points forked onto different branches, and a bind group cached over a
 * depth view the row has since reallocated.
 */

type Harness = {
  device: GPUDevice;
  renderPipelines: GPURenderPipelineDescriptor[];
  bindGroups: GPUBindGroupDescriptor[];
  shaderCode: string[];
  descOf: Map<unknown, GPURenderPipelineDescriptor>;
};

function mockDevice(): Harness {
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const bindGroups: GPUBindGroupDescriptor[] = [];
  const shaderCode: string[] = [];
  const descOf = new Map<unknown, GPURenderPipelineDescriptor>();
  const device = {
    createShaderModule: vi.fn((desc: GPUShaderModuleDescriptor) => {
      shaderCode.push(desc.code);
      return { getCompilationInfo: () => Promise.resolve({ messages: [] }) };
    }),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroups.push(desc);
      return {};
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      const handle = {};
      descOf.set(handle, desc);
      return handle;
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
  return { device, renderPipelines, bindGroups, shaderCode, descOf };
}

function build() {
  const h = mockDevice();
  const texture = () => ({ createView: vi.fn(() => ({})) }) as unknown as GPUTexture;
  const renderer = createAerialPerspectiveRenderer(
    h.device,
    'rgba16float',
    {} as GPUSampler,
    {} as GPUTextureView,
    {} as GPUShaderModule,
    new Map([
      [
        'earth',
        {
          scatteringBuffer: {} as GPUBuffer,
          skyViewParamsBuffer: {} as GPUBuffer,
          shellUniformBuffer: {} as GPUBuffer,
          transmittanceTex: texture(),
          multiScatterTex: texture(),
          skyViewTex: texture(),
        },
      ],
    ]),
  );
  return { ...h, renderer };
}

/** Classify an apply pipeline by what its colour blend DOES, not by its label. */
function blendRole(desc: GPURenderPipelineDescriptor): string {
  const color = Array.from(desc.fragment!.targets!)[0]!.blend!.color;
  if (color.srcFactor === 'zero' && color.dstFactor === 'src') return 'multiply';
  if (color.srcFactor === 'one' && color.dstFactor === 'one') return 'add';
  return `other(${color.srcFactor}/${color.dstFactor})`;
}

/** The scene-depth resource a built group carries, by identity. */
function depthEntryOf(desc: GPUBindGroupDescriptor): unknown {
  return Array.from(desc.entries).find((e) => e.binding === 7)?.resource;
}

function mockPass(order: string[], descOf: Map<unknown, GPURenderPipelineDescriptor>) {
  return {
    setPipeline: vi.fn((p: unknown) => {
      const desc = descOf.get(p);
      order.push(desc === undefined ? 'unknown' : blendRole(desc));
    }),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(() => order.push('draw')),
  } as unknown as GPURenderPassEncoder;
}

describe('createAerialPerspectiveRenderer — the apply', () => {
  it('builds the pair with no depthStencil state', () => {
    // The step declares `depth: 'sample'` and opens its pass with no depth
    // attachment; a pipeline carrying a depth state is invalid against it, and
    // the browser only says so when the draw is encoded.
    const { renderPipelines } = build();
    expect(renderPipelines.map(blendRole)).toEqual(['multiply', 'add']);
    for (const desc of renderPipelines) {
      expect(desc.depthStencil).toBeUndefined();
    }
  });

  it('draws twice, MULTIPLY before ADD, with no vertex or index buffer', () => {
    const { descOf, renderer } = build();
    const order: string[] = [];
    const pass = mockPass(order, descOf);

    renderer.draw(pass, 'earth', new Float32Array(ATMOSPHERE_UNIFORM_FLOATS), {} as GPUTextureView);

    expect(order).toEqual(['multiply', 'draw', 'add', 'draw']);
    expect(pass.setVertexBuffer).not.toHaveBeenCalled();
    expect(pass.setIndexBuffer).not.toHaveBeenCalled();
  });

  it('rebuilds the bind group only when the depth view changes identity', () => {
    // `depthViewOf('foreground:0')` hands back a NEW view once `reconcile`
    // reallocates the row; a group cached over the destroyed texture is a
    // validation error, and on iOS a silently dropped frame.
    const { descOf, renderer, bindGroups } = build();
    const pass = mockPass([], descOf);
    const uniforms = new Float32Array(ATMOSPHERE_UNIFORM_FLOATS);
    const first = {} as GPUTextureView;
    const after = bindGroups.length;

    renderer.draw(pass, 'earth', uniforms, first);
    renderer.draw(pass, 'earth', uniforms, first);
    expect(bindGroups.length).toBe(after + 1);
    expect(depthEntryOf(bindGroups[after]!)).toBe(first);

    const second = {} as GPUTextureView;
    renderer.draw(pass, 'earth', uniforms, second);
    expect(bindGroups.length).toBe(after + 2);
    expect(depthEntryOf(bindGroups[after + 1]!)).toBe(second);
  });

  it('takes both entry points through one branch evaluation', () => {
    // Not a call-detection grep: the two draws MUST agree on which branch each
    // pixel took, and they do so by construction — one `aerialSample`, two
    // readers. This fails only if an edit forks one entry point onto its own
    // inline branch, which reads as a half-fogged frame.
    const { shaderCode } = build();
    const linked = shaderCode.join('\n');
    for (const entryPoint of ['fsAerialMultiply', 'fsAerialAdd']) {
      const body = new RegExp(`fn\\s+${entryPoint}\\([^{]*\\{([^]*?)\\n\\}`).exec(linked)?.[1];
      expect(body).toContain('aerialSample(');
    }
  });
});
