import { describe, it, expect, vi } from 'vitest';
import { createAtmosphereShellRenderer } from '../../../../../src/services/gpu/renderers/atmosphere/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from '../../../../../src/data/bodies/atmosphereParams';

/**
 * The shell draws its geometry TWICE (MULTIPLY then ADD) because per-channel
 * extinction does not fit one alpha channel. Nothing in the type system pins the
 * two passes together, so these tests pin the failures that are silent and
 * visual: a collapse back to one blend, divergent depth/cull state (the two
 * passes stop covering the same pixels, so the limb double-counts or drops), an
 * entry point the shader does not declare, and the draw order (ADD first would
 * attenuate this body's own in-scatter by its own transmittance).
 */

/** Records what the renderer built. `descOf` maps each opaque pipeline handle
 *  back to the descriptor it came from, so a draw-order assertion can name the
 *  pipelines by what they do. */
type Harness = {
  device: GPUDevice;
  renderPipelines: GPURenderPipelineDescriptor[];
  shaderCode: string[];
  descOf: Map<unknown, GPURenderPipelineDescriptor>;
};

function mockDevice(): Harness {
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const shaderCode: string[] = [];
  const descOf = new Map<unknown, GPURenderPipelineDescriptor>();
  const computePass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn((desc: GPUShaderModuleDescriptor) => {
      shaderCode.push(desc.code);
      return { getCompilationInfo: () => Promise.resolve({ messages: [] }) };
    }),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      const handle = {};
      descOf.set(handle, desc);
      return handle;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: vi.fn(() => computePass),
      finish: vi.fn(() => ({})),
    })),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn(), submit: vi.fn() },
  } as unknown as GPUDevice;
  return { device, renderPipelines, shaderCode, descOf };
}

function build() {
  const h = mockDevice();
  const renderer = createAtmosphereShellRenderer(h.device, 'rgba16float', 'depth32float', true, {
    earth: ATMOSPHERE_PARAMS.earth!,
  });
  return { ...h, renderer };
}

/** Classify a shell pipeline by what its colour blend DOES, not by its label —
 *  `dst *= src` is the multiply pass, `dst += src` the add pass. */
function blendRole(desc: GPURenderPipelineDescriptor): string {
  const target = Array.from(desc.fragment!.targets!)[0]!;
  const color = target.blend!.color;
  if (color.srcFactor === 'zero' && color.dstFactor === 'src') return 'multiply';
  if (color.srcFactor === 'one' && color.dstFactor === 'one') return 'add';
  return `other(${color.srcFactor}/${color.dstFactor})`;
}

describe('createAtmosphereShellRenderer — the MULTIPLY/ADD pair', () => {
  it('builds one multiplicative and one additive shell pipeline', () => {
    const { renderPipelines } = build();
    // The three LUT bakes go through createComputePipeline, so every render
    // pipeline here is a shell pass.
    expect(renderPipelines.map(blendRole)).toEqual(['multiply', 'add']);
  });

  it('gives both shell passes identical depth, primitive and vertex state', () => {
    const { renderPipelines } = build();
    const [multiply, add] = renderPipelines as [
      GPURenderPipelineDescriptor,
      GPURenderPipelineDescriptor,
    ];
    expect(add.depthStencil).toEqual(multiply.depthStencil);
    expect(add.primitive).toEqual(multiply.primitive);
    expect(add.vertex).toEqual(multiply.vertex);
    expect(add.layout).toBe(multiply.layout);
    expect(add.fragment!.entryPoint).not.toBe(multiply.fragment!.entryPoint);
  });

  it('names entry points the linked WESL modules actually declare', () => {
    // The TS `entryPoint` string and the `fn` name in the .wesl are a cross-file
    // contract with no compiler check; a rename on one side fails only when the
    // browser builds the pipeline.
    const { renderPipelines, shaderCode } = build();
    const linked = shaderCode.join('\n');
    for (const desc of renderPipelines) {
      for (const entryPoint of [desc.vertex.entryPoint, desc.fragment!.entryPoint]) {
        expect(linked).toMatch(new RegExp(`fn\\s+${entryPoint!}\\s*\\(`));
      }
    }
  });

  it('draws the geometry twice, MULTIPLY before ADD', () => {
    const { descOf, renderer } = build();
    const order: string[] = [];
    const pass = {
      setPipeline: vi.fn((p: unknown) => {
        const desc = descOf.get(p);
        order.push(desc === undefined ? 'unknown' : blendRole(desc));
      }),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(() => order.push('draw')),
    } as unknown as GPURenderPassEncoder;

    renderer.draw(pass, 'earth', new Float32Array(28));

    expect(order).toEqual(['multiply', 'draw', 'add', 'draw']);
  });
});
