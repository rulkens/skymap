import { describe, it, expect, vi } from 'vitest';
import { createAtmosphereShellRenderer } from '../../../../../src/services/gpu/renderers/atmosphere/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from '../../../../../src/data/bodies/atmosphereParams';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../../src/utils/gpu/packAtmosphereUniforms';

/**
 * The shell draws its geometry TWICE (MULTIPLY then ADD) because per-channel
 * extinction does not fit one alpha channel. Nothing in the type system pins the
 * two passes together, so these tests pin the failures that are silent and
 * visual: a collapse back to one blend, divergent depth/cull state (the two
 * passes stop covering the same pixels, so the limb double-counts or drops), an
 * entry point the shader does not declare, and the draw order (ADD first would
 * attenuate this body's own in-scatter by its own transmittance).
 */

/** A stub GPUTexture: just enough surface for the renderer to create a view
 *  from it and destroy it, with `destroy` spied so a test can tell whether ITS
 *  specific texture (not some other body's, not a differently-sized rebuild)
 *  was the one released. */
type StubTexture = { label: string; createView: () => object; destroy: ReturnType<typeof vi.fn> };

/** Records what the renderer built. `descOf` maps each opaque pipeline handle
 *  back to the descriptor it came from, so a draw-order assertion can name the
 *  pipelines by what they do. `texturesByLabel` — most recent write wins — lets
 *  a `reconcile` test grab the exact `StubTexture` a label resolved to at a
 *  given point, e.g. before vs. after a resize. */
type Harness = {
  device: GPUDevice;
  renderPipelines: GPURenderPipelineDescriptor[];
  shaderCode: string[];
  descOf: Map<unknown, GPURenderPipelineDescriptor>;
  texturesByLabel: Map<string, StubTexture>;
  /** Every bind group built so far, by label — so a `reconcile` test can say
   *  WHICH groups were rebuilt, not merely how many. */
  bindGroupLabels: string[];
};

function mockDevice(): Harness {
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const shaderCode: string[] = [];
  const descOf = new Map<unknown, GPURenderPipelineDescriptor>();
  const texturesByLabel = new Map<string, StubTexture>();
  const computePass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const bindGroupLabels: string[] = [];
  const createBindGroup = vi.fn((desc: GPUBindGroupDescriptor) => {
    bindGroupLabels.push(desc.label ?? '');
    return {};
  });
  const device = {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn((desc: GPUShaderModuleDescriptor) => {
      shaderCode.push(desc.code);
      return { getCompilationInfo: () => Promise.resolve({ messages: [] }) };
    }),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => {
      const label = desc.label ?? '';
      const texture: StubTexture = { label, createView: () => ({}), destroy: vi.fn() };
      texturesByLabel.set(label, texture);
      return texture;
    }),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup,
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
  return {
    device,
    renderPipelines,
    shaderCode,
    descOf,
    texturesByLabel,
    bindGroupLabels,
  };
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
    // pipeline here is a shell pass: the outside pair, then the aerial pair.
    expect(renderPipelines.map(blendRole)).toEqual(['multiply', 'add', 'multiply', 'add']);
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

    renderer.draw(pass, 'earth', new Float32Array(ATMOSPHERE_UNIFORM_FLOATS));

    expect(order).toEqual(['multiply', 'draw', 'add', 'draw']);
  });
});

describe('reconcile — tier-switchable sky-view LUT size', () => {
  it('is a no-op when the size matches what is already built (the every-frame common case)', () => {
    const { renderer, texturesByLabel, bindGroupLabels } = build();
    const before = texturesByLabel.get('atmosphere-skyview-lut-earth');
    const bindGroupsBefore = bindGroupLabels.length;

    // Matches the construction-time default (SKY_VIEW_LUT_SIZE) — nothing to do.
    renderer.reconcile({ skyViewLutSize: [192, 108] });

    expect(texturesByLabel.get('atmosphere-skyview-lut-earth')).toBe(before);
    expect(bindGroupLabels.length).toBe(bindGroupsBefore);
  });

  it('recreates skyViewTex and rebuilds every bind group that references it, the aerial renderer included', () => {
    const { renderer, texturesByLabel, bindGroupLabels } = build();
    const before = texturesByLabel.get('atmosphere-skyview-lut-earth')!;
    const bindGroupsBefore = bindGroupLabels.length;

    renderer.reconcile({ skyViewLutSize: [64, 36] });

    // The old texture is the one released — not left for `destroy()` to find
    // as a stale handle later.
    expect(before.destroy).toHaveBeenCalledTimes(1);
    const after = texturesByLabel.get('atmosphere-skyview-lut-earth');
    expect(after).not.toBe(before);
    // skyViewBindGroup (binding 5, storage output) and shellBindGroup
    // (binding 2, sampled) reference the resized texture; the aerial renderer
    // holds views of the same bundle, so `rebind` must reach it too — its apply
    // entries are rebuilt lazily, its bake group here.
    expect(bindGroupLabels.slice(bindGroupsBefore)).toEqual([
      'atmosphere-skyview-bg-earth',
      'atmosphere-shell-bg-earth',
      'atmosphere-froxel-bg-earth',
    ]);
  });
});
