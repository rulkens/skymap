import { describe, it, expect, vi } from 'vitest';
import { createLabelRenderer } from '../../../../../src/services/gpu/renderers/labels/labelRenderer';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import type { LoadedFontAtlases } from '../../../../../src/@types/rendering/LoadedFontAtlases';
import { GLYPH_INSTANCE_BYTES } from '../../../../../src/data/labels/glyphInstanceBytes';
import { LABEL_RECORD_WORDS } from '../../../../../src/data/labels/labelRecordLayout';
import { LABEL_RECORD_UNIFORM_OFFSETS as RU } from '../../../../../src/data/labels/labelRecordUniformLayout';
import { LABEL_TEXT_PX } from '../../../../../src/data/labels/labelTextPx';
import { STAGE_CAMERA, stageRecords } from '../../../../helpers/labels/labelStageFixture';
import type { OverlaySceneOcclusion } from '../../../../../src/@types/rendering/OverlaySceneOcclusion';
import vsOccludeMaskCode from '../../../../../src/services/gpu/shaders/labels/vertexOccludeMask.wesl?static';
import fsOccludeMaskCode from '../../../../../src/services/gpu/shaders/labels/fragmentOccludeMask.wesl?static';

// Minimal BMFont fixture: just the uppercase A (codepoint 65), enough for the
// factory to size its atlas.
const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 0,
      yoffset: 0,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
  ],
});

// LoadedFontAtlases shape: one entry per registered FontId; bitmaps
// array stays empty so the renderer's GPU upload branch is skipped.
const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};

// The factory's descriptors and uploads are the only observable surface here — a
// device that records them is what makes them assertable without WebGPU.
function build() {
  const writes: { label: string; words: number }[] = [];
  const uniforms: Float32Array[] = [];
  const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
  const pipelineLayouts: GPUPipelineLayoutDescriptor[] = [];
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const device = {
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      bindGroupLayouts.push(desc);
      return {};
    }),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn((desc: GPUPipelineLayoutDescriptor) => {
      pipelineLayouts.push(desc);
      return {};
    }),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      return { label: desc.label };
    }),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    queue: {
      writeBuffer: vi.fn(
        (buffer: GPUBuffer, _at: number, data: unknown, _from?: number, words?: number) => {
          if (buffer.label === 'label-uniforms')
            uniforms.push(new Float32Array(data as Float32Array));
          writes.push({ label: buffer.label, words: words ?? -1 });
        },
      ),
      copyExternalImageToTexture: vi.fn(),
    },
  } as unknown as GPUDevice;

  const ctx = {
    device,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  const renderer = createLabelRenderer(ctx, {
    targetFormat: ctx.format,
    atlases: FIXTURE_ATLASES,
  });
  return {
    renderer,
    device,
    writes,
    uniforms,
    bindGroupLayouts,
    pipelineLayouts,
    renderPipelines,
  };
}

describe('LabelRenderer set', () => {
  it('a rebuilt renderer uploads every record and glyph, whatever the dirty range', () => {
    const records = stageRecords([
      { text: 'AA', position: [0, 0, -1] },
      { text: 'A', position: [0, 0, -1] },
    ]);
    // The director spent the range on the renderer this one replaces.
    records.dirtyFrom = records.dirtyTo;
    const { renderer, writes } = build();
    const uploads = () => writes.splice(0).filter((w) => w.label !== 'label-uniforms');
    uploads();
    renderer.set(records);
    expect(uploads()).toEqual([
      { label: 'label-glyphs', words: (3 * GLYPH_INSTANCE_BYTES) / 4 },
      { label: 'label-records', words: 2 * LABEL_RECORD_WORDS },
    ]);
    renderer.set(records);
    expect(uploads()).toEqual([]);
    records.generation++;
    renderer.set(records);
    expect(uploads()).toEqual([{ label: 'label-glyphs', words: (3 * GLYPH_INSTANCE_BYTES) / 4 }]);
  });
});

describe('LabelRenderer draw', () => {
  it.each([1, 2, 3])("clamps the drawn text to the CPU rect's px range at dpr %i", (dpr) => {
    const records = stageRecords([{ text: 'A', position: [0, 0, -1] }]);
    const { renderer, uniforms } = build();
    renderer.set(records);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const projection = { ...STAGE_CAMERA.output, pxScale: dpr };
    renderer.draw(pass, { projection, hoveredPick: null, selectedPick: null });
    const sent = uniforms.at(-1)!;
    expect(sent[RU.minTextPx / 4]).toBe(LABEL_TEXT_PX.min * dpr);
    expect(sent[RU.maxTextPx / 4]).toBe(LABEL_TEXT_PX.max * dpr);
  });
});

describe('LabelRenderer occlusion variant', () => {
  it('builds the plain and sampled-depth pairs up front, the mask pair on its first draw', () => {
    // A device-only pipeline-validation error (wrong group count) never surfaces in a
    // headless suite, so the layout shape is pinned here. Only the dome hands a mask over:
    // mono must not carry its modules and pipelines.
    const { renderer, device, bindGroupLayouts, pipelineLayouts, renderPipelines } = build();
    renderer.set(stageRecords([{ text: 'A', position: [0, 0, -1] }]));
    const draw = (scene: OverlaySceneOcclusion): void => {
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
      };
      const view = { projection: STAGE_CAMERA.output, hoveredPick: null, selectedPick: null };
      renderer.draw(pass as unknown as GPURenderPassEncoder, view, scene);
    };
    const groupCounts = () =>
      pipelineLayouts.map((layout) => Array.from(layout.bindGroupLayouts).length);
    const texView = {} as GPUTextureView;

    draw({ kind: 'sampled-depth', colorView: texView, depthView: texView, frame: null });
    // The label BGL (shared by every pipeline) and the coverage joint; glyphs + leaders each.
    expect(bindGroupLayouts).toHaveLength(2);
    expect(groupCounts()).toEqual([1, 2]);
    expect(renderPipelines).toHaveLength(4);
    expect(device.createShaderModule).toHaveBeenCalledTimes(4);

    draw({ kind: 'mask', maskView: texView });
    draw({ kind: 'mask', maskView: texView });
    expect(bindGroupLayouts).toHaveLength(3);
    expect(groupCounts()).toEqual([1, 2, 2]);
    expect(renderPipelines).toHaveLength(6);
    expect(device.createShaderModule).toHaveBeenCalledTimes(6);
  });

  it('picks the pipeline pair from the occlusion it is handed', () => {
    // The dome's labels must go through the mask pair: the sampled-depth pair bound to
    // a mask view is a device-only validation error, and the plain pair hides nothing.
    const { renderer, device } = build();
    renderer.set(stageRecords([{ text: 'A', position: [0, 0, -1] }]));
    const leadersOf = (scene?: OverlaySceneOcclusion): string => {
      const setPipeline = vi.fn();
      const pass = { setPipeline, setBindGroup: vi.fn(), setVertexBuffer: vi.fn(), draw: vi.fn() };
      const view = { projection: STAGE_CAMERA.output, hoveredPick: null, selectedPick: null };
      renderer.draw(pass as unknown as GPURenderPassEncoder, view, scene);
      return (setPipeline.mock.calls[0]![0] as { label: string }).label;
    };
    const maskView = { id: 'mask' } as unknown as GPUTextureView;

    expect(leadersOf()).toBe('label-pipeline-leaders');
    expect(leadersOf({ kind: 'mask', maskView })).toBe('label-pipeline-occlude-mask-leaders');
    const maskGroup = (device.createBindGroup as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(Array.from(maskGroup.entries as GPUBindGroupEntry[])).toEqual([
      { binding: 0, resource: maskView },
    ]);
    expect(
      leadersOf({ kind: 'sampled-depth', colorView: maskView, depthView: maskView, frame: null }),
    ).toBe('label-pipeline-occlude-leaders');
  });

  it('the mask stages link without the sampled-depth joint, and read the mask in both', () => {
    // group(1) is one texture in the mask layout: a stray `lib::sceneDepth` binding in
    // either stage is a pipeline-validation error only a device reports.
    for (const code of [vsOccludeMaskCode, fsOccludeMaskCode]) {
      expect(code).toContain('occlusionMaskTex');
      expect(code).not.toContain('sceneDepthTex');
      expect(code).not.toContain('sceneColorTex');
    }
    expect(vsOccludeMaskCode).toContain('fn vsOccludeMask');
    expect(vsOccludeMaskCode).toContain('fn vsLeaderOccludeMask');
    expect(vsOccludeMaskCode).not.toContain('fn vsOcclude(');
  });

  it('draws the occlusion pipeline through vsOcclude, never vs — vs must stay clear of group(1)', () => {
    // vertex.wesl's 'vs' cannot statically reference lib::sceneDepth's group(1)
    // bindings (the plain pipeline's layout has none), so the occlusion
    // pipeline's vertex stage MUST come from the separate vertexOcclude.wesl
    // module's 'vsOcclude' entry — a device-only pipeline-validation error
    // (group(1) used but not in the layout) never surfaces in this headless
    // suite, so pin the entry point here.
    const { renderPipelines } = build();
    const plain = renderPipelines.find((p) => p.label === 'label-pipeline-glyphs');
    const occlude = renderPipelines.find((p) => p.label === 'label-pipeline-occlude-glyphs');
    expect(plain!.vertex.entryPoint).toBe('vs');
    expect(occlude!.vertex.entryPoint).toBe('vsOcclude');
  });

  it('blends the occlusion pipeline PREMULTIPLIED — the contract sceneTransmittance depends on', () => {
    // `fragmentOcclude.wesl` returns `shade(...) * sceneTransmittance(...)`:
    // one scalar scaling an already-premultiplied rgba. That is only a fade
    // under a `one` source factor. Flip this target to the compositor's
    // straight-alpha OVER (`src-alpha`) and the hardware multiplies by alpha a
    // SECOND time — captions crush toward black instead of fading out, on a
    // device only. The shader can't state the requirement; this can.
    const { renderPipelines } = build();
    const occlude = renderPipelines.find((p) => p.label?.includes('occlude'));
    const target = Array.from(occlude!.fragment!.targets!)[0]!;
    expect(target!.blend?.color.srcFactor).toBe('one');
    expect(target!.blend?.color.dstFactor).toBe('one-minus-src-alpha');
  });
});
