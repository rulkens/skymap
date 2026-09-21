import { describe, it, expect, vi } from 'vitest';
import { createAtmosphereShellRenderer } from '../../../../../src/services/gpu/renderers/atmosphere/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from '../../../../../src/data/bodies/atmosphereParams';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../../src/utils/gpu/packAtmosphereUniforms';
import type { AtmosphereShellDepth } from '../../../../../src/@types/rendering/AtmosphereShellDepth';

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
  const renderer = createAtmosphereShellRenderer(h.device, 'rgba16float', {
    earth: ATMOSPHERE_PARAMS.earth!,
  });
  return { ...h, renderer };
}

const SCENE_DEPTH_VIEW = { label: 'foreground-depth' } as unknown as GPUTextureView;

/** The sampled-depth record a shell draw takes. A null frame is the
 *  far-placeholder case, which is what every draw below is. */
function shellDepth(view: GPUTextureView = SCENE_DEPTH_VIEW): AtmosphereShellDepth {
  return { frame: null, view, viewportPx: [1280, 720], kmToLocal: 1 / 6471 };
}

/** Enough of a render pass for the shell's MULTIPLY/ADD pair. */
function shellRenderPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

/** Enough of a render pass for the aerial apply's two full-screen draws. */
function aerialRenderPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
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

  it('declares no depth state on either shell pass — the step attaches none', () => {
    // The shell's step SAMPLES `foreground:0`'s depth, so its pass has no depth
    // attachment, and WebGPU rejects a pipeline that names a depth format there.
    // Headless-only: on hardware this surfaces as a dropped draw, not an error
    // anything in this suite would see.
    const [multiply, add] = build().renderPipelines as [
      GPURenderPipelineDescriptor,
      GPURenderPipelineDescriptor,
    ];
    expect(multiply.depthStencil).toBeUndefined();
    expect(add.depthStencil).toBeUndefined();
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

    renderer.draw(pass, 'earth', new Float32Array(ATMOSPHERE_UNIFORM_FLOATS), shellDepth());

    expect(order).toEqual(['multiply', 'draw', 'add', 'draw']);
  });

  it('rebuilds the bind group only when the sampled depth view changes', () => {
    // A bind group holds a specific GPUTextureView, and `depthViewOf` hands
    // back a NEW one once the target reallocates — a cached group would keep
    // pointing at the destroyed texture (on iOS, a silently dropped frame).
    // Rebuilding on every draw instead would be a per-frame allocation the
    // shell does not need.
    const { renderer, bindGroupLabels } = build();
    const uniforms = new Float32Array(ATMOSPHERE_UNIFORM_FLOATS);
    renderer.draw(shellRenderPass(), 'earth', uniforms, shellDepth());
    const afterFirst = bindGroupLabels.length;

    renderer.draw(shellRenderPass(), 'earth', uniforms, shellDepth());
    expect(bindGroupLabels.length).toBe(afterFirst);

    const resized = { label: 'foreground-depth-resized' } as unknown as GPUTextureView;
    renderer.draw(shellRenderPass(), 'earth', uniforms, shellDepth(resized));
    expect(bindGroupLabels.slice(afterFirst)).toEqual(['atmosphere-shell-bg-earth']);
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
    const depthView = { label: 'depth' } as unknown as GPUTextureView;
    // Both the aerial apply and the shell cache their group over a depth view,
    // so each rebuilds after `reconcile` only if it was invalidated there.
    renderer.drawAerialPerspective(aerialRenderPass(), 'earth', depthView);
    renderer.draw(
      shellRenderPass(),
      'earth',
      new Float32Array(ATMOSPHERE_UNIFORM_FLOATS),
      shellDepth(),
    );
    const bindGroupsBefore = bindGroupLabels.length;

    renderer.reconcile({ skyViewLutSize: [64, 36] });

    // The old texture is the one released — not left for `destroy()` to find
    // as a stale handle later.
    expect(before.destroy).toHaveBeenCalledTimes(1);
    const after = texturesByLabel.get('atmosphere-skyview-lut-earth');
    expect(after).not.toBe(before);
    // skyViewBindGroup (binding 5, storage output) and shellBindGroup
    // (binding 2, sampled) reference the resized texture; the aerial apply
    // samples it too. The two cached groups rebuild lazily, at their next draw
    // — the SAME depth view each time, so the rebuild can only be reconcile's.
    renderer.draw(
      shellRenderPass(),
      'earth',
      new Float32Array(ATMOSPHERE_UNIFORM_FLOATS),
      shellDepth(),
    );
    renderer.drawAerialPerspective(aerialRenderPass(), 'earth', depthView);
    expect(bindGroupLabels.slice(bindGroupsBefore)).toEqual([
      'atmosphere-skyview-bg-earth',
      'atmosphere-shell-bg-earth',
      'atmosphere-aerial-bg-earth',
    ]);
  });
});
