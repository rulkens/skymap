import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { createVolumeFieldRenderer } from '../../../../../src/services/gpu/renderers/volumeField/volumeFieldRenderer';
import { MCPM_ENTRY } from '../../../../../src/layers/cosmicWebDensity/sources/mcpm';
import type { GpuVolume } from '../../../../../src/@types/rendering/GpuVolume';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';
import type { VolumeFieldDrawInputs } from '../../../../../src/@types/rendering/VolumeFieldDrawInputs';
import type { VolumeFieldRendererDeps } from '../../../../../src/@types/rendering/VolumeFieldRendererDeps';
import type { DetailRegionDraw } from '../../../../../src/@types/rendering/DetailRegionDraw';

function fixture(): GpuVolume {
  return {
    texture: { createView: vi.fn(() => ({})), destroy: vi.fn() } as unknown as GPUTexture,
    placement: {
      dims: [4, 4, 4],
      frameKind: 'equatorial-cartesian',
      origin: [-100, -100, -100],
      voxelSize: 50,
      rotation: [0, 0, 0, 1],
    },
    gain: 1,
    nativeBox: { offset: [0, 0, 0], scale: [1, 1, 1] },
  };
}

/** Enough GPUDevice for construction and draw; draw tests assert on the recorded `writeBuffer` and
 *  `writeTexture` calls. */
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  const makeTexture = () => ({
    createView: vi.fn(() => ({})),
    destroy: vi.fn(),
  });
  return {
    createTexture: vi.fn(() => makeTexture()),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

function deps(device: GPUDevice): VolumeFieldRendererDeps {
  return {
    device,
    targetFormat: 'bgra8unorm',
    fadeBgl: {} as never,
    jitterMask: { createView: () => ({}) } as unknown as GPUTexture,
  };
}

function makeFakePass() {
  return {
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    setBlendConstant: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

const INPUTS: VolumeFieldDrawInputs = { jitterIndex: 1, steps: 128, weight: 1 };

function fullSettings(overrides: Record<string, unknown> = {}): VolumeFieldSettings {
  return {
    enabled: true,
    intensity: 0.9,
    contrast: 4,
    densityScale: 2,
    paletteId: MCPM_ENTRY.paletteId,
    trim: 0.1,
    exposure: 3,
    ...overrides,
  } as VolumeFieldSettings;
}

/** The per-field uniform scratch (76 floats); the fade write is a 16-byte ArrayBuffer instead. */
function uniformScratch(device: GPUDevice): Float32Array | undefined {
  const calls = (device.queue.writeBuffer as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  const hit = calls.find(
    (c) => c[2] instanceof Float32Array && (c[2] as Float32Array).length === 76,
  );
  return hit?.[2] as Float32Array | undefined;
}

describe('createVolumeFieldRenderer draw', () => {
  it('draw reads field values from settingsOf', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
      () => null,
      INPUTS,
    );
    const s = uniformScratch(device);
    expect(s?.[55]).toBeCloseTo(0.9); // intensity
    expect(s?.[57]).toBeCloseTo(4); // contrast
    expect(s?.[56]).toBeCloseTo(2); // densityScale
    expect(s?.[61]).toBeCloseTo(3); // exposure
    expect(s?.[62]).toBeCloseTo(0.1); // trim
  });

  it('upload seeds contrastCenter / envelope from statics, for an id no registry row names', () => {
    // The renderer names no registry, so a second caller on its own ids needs no wider id union.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    const statics = {
      paletteId: 'viridis' as const,
      contrastCenter: 0.5,
      envelope: { inner: 0.7, outer: 1.2 },
    };
    expect(() => r.upload('dust', fixture(), statics)).not.toThrow();
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings({ paletteId: statics.paletteId }),
      () => 1,
      () => null,
      INPUTS,
    );
    const s = uniformScratch(device);
    expect(s?.[58]).toBeCloseTo(statics.contrastCenter); // contrastCenter
    expect(s?.[59]).toBeCloseTo(statics.envelope.inner); // envelopeInner
    expect(s?.[60]).toBeCloseTo(statics.envelope.outer); // envelopeOuter
  });

  it('draw re-uploads the LUT once when settingsOf paletteId changes', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    const before = (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    // Draw with the statics-seeded default palette (already resident).
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings({ paletteId: MCPM_ENTRY.paletteId }),
      () => 1,
      () => null,
      INPUTS,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before);
    // Draw with a different palette — mcpm defaults to 'inferno', so 'viridis' diverges.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
      () => null,
      INPUTS,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before + 1);
    // Draw again with 'viridis' — already resident, no further upload.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
      () => null,
      INPUTS,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before + 1);
  });

  it('draw skips an ENABLED field whose resolved opacity is 0', () => {
    // Opacity is the sole visibility truth: an enabled field spatially faded
    // to 0 (the deep-zoom band) must not burn a raymarch.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings({ enabled: true }),
      () => 0,
      () => null,
      INPUTS,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(uniformScratch(device)).toBeUndefined();
  });

  it('draw packs jitterIndex modulo the wrap', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
      () => null,
      { ...INPUTS, jitterIndex: 1_000_005 },
    );
    expect(uniformScratch(device)?.[63]).toBe(5);
  });

  // A decay per field would fade every field drawn before it (MCPM −65% with 2MRS on). One decay,
  // then every field adds at w: dst·(1−w) + w·Σ fields. The blend constant must be set too:
  // WebGPU's default of 0 erases the volume.
  it('below weight 1, one decay draw precedes every field', () => {
    const pipelines: GPURenderPipelineDescriptor[] = [];
    const device = mockDevice(pipelines);
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.upload('polyphorm-2mrs', fixture(), MCPM_ENTRY);
    const log: unknown[][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        log.push([name, ...args]);
    const pass = {
      setPipeline: record('setPipeline'),
      setVertexBuffer: () => undefined,
      setIndexBuffer: () => undefined,
      setBindGroup: () => undefined,
      setBlendConstant: record('setBlendConstant'),
      draw: record('draw'),
      drawIndexed: record('drawIndexed'),
    } as unknown as GPURenderPassEncoder;
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
      () => null,
      { ...INPUTS, weight: 0.25 },
    );

    const decayComponent = { srcFactor: 'zero', dstFactor: 'one-minus-constant', operation: 'add' };
    const decayAt = pipelines.findIndex((p) => {
      const blend = [...(p.fragment?.targets ?? [])][0]?.blend;
      return (
        JSON.stringify(blend?.color) === JSON.stringify(decayComponent) &&
        JSON.stringify(blend?.alpha) === JSON.stringify(decayComponent)
      );
    });
    const decayPipeline = vi.mocked(device.createRenderPipeline).mock.results[decayAt]?.value;
    expect(decayPipeline).toBeDefined();
    expect(log.map(([name]) => name)).toEqual([
      'setBlendConstant',
      'setPipeline',
      'draw',
      'setPipeline',
      'drawIndexed',
      'setPipeline',
      'drawIndexed',
    ]);
    expect(log[0]).toEqual(['setBlendConstant', { r: 0.25, g: 0.25, b: 0.25, a: 0.25 }]);
    expect(log[1]).toEqual(['setPipeline', decayPipeline]);
    expect(log[2]).toEqual(['draw', 3]);
  });

  // At weight 1 the executor has just cleared the target, so a decay would scale zero.
  it('at weight 1 no decay draw is issued', () => {
    const r = createVolumeFieldRenderer(deps(mockDevice()));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
      () => null,
      INPUTS,
    );
    expect(pass.draw).not.toHaveBeenCalled();
    expect(pass.drawIndexed).toHaveBeenCalledOnce();
  });
});

/** The mocks `createTexture` (below: `createBuffer`) returned, in call order, so a test asserts
 *  `destroy` on a specific one. */
function createdTextures(device: GPUDevice): { destroy: () => void }[] {
  return (
    device.createTexture as unknown as { mock: { results: { value: { destroy: () => void } }[] } }
  ).mock.results.map((r) => r.value);
}
function createdBuffers(device: GPUDevice): { destroy: () => void }[] {
  return (
    device.createBuffer as unknown as { mock: { results: { value: { destroy: () => void } }[] } }
  ).mock.results.map((r) => r.value);
}

// How many fields one draw raymarches, every field at full settings and opacity.
function fieldsDrawn(r: ReturnType<typeof createVolumeFieldRenderer>): number {
  const pass = makeFakePass();
  r.draw(
    pass,
    new Float32Array(16) as unknown as Mat4,
    [320, 180],
    1000,
    [0, 0, 5],
    () => fullSettings(),
    () => 1,
    () => null,
    INPUTS,
  );
  return (pass.drawIndexed as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe('createVolumeFieldRenderer unload / re-upload', () => {
  it("unload destroys the field's four GPU resources and drops it from the map", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    const volume = fixture();
    const before = createdTextures(device).length;
    r.upload('mcpm', volume, MCPM_ENTRY);
    // upload() creates one texture (the palette; the volume arrives finished) and, last among
    // buffers, [uniformBuffer, fadeBuffer]: the factory already made its own.
    const textures = createdTextures(device).slice(before);
    expect(textures).toHaveLength(1);
    const [paletteTexture] = textures;
    const [uniformBuffer, fadeBuffer] = createdBuffers(device).slice(-2);
    r.unload('mcpm');
    expect(volume.texture.destroy).toHaveBeenCalledTimes(1);
    expect(paletteTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(uniformBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fadeBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fieldsDrawn(r)).toBe(0);
  });

  it("re-uploading the same id destroys the previous field's resources first", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    const first = fixture();
    r.upload('mcpm', first, MCPM_ENTRY);
    const paletteTexture = createdTextures(device).at(-1);
    const [uniformBuffer, fadeBuffer] = createdBuffers(device).slice(-2);
    const second = fixture();
    r.upload('mcpm', second, MCPM_ENTRY);
    expect(first.texture.destroy).toHaveBeenCalledTimes(1);
    expect(second.texture.destroy).not.toHaveBeenCalled();
    expect(paletteTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(uniformBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fadeBuffer!.destroy).toHaveBeenCalledTimes(1);
    // The replace, not an add: exactly one 'mcpm' entry survives.
    expect(fieldsDrawn(r)).toBe(1);
  });
});

describe('createVolumeFieldRenderer hasActiveFields', () => {
  it('is false when the only enabled field has opacity 0, true through a fade-out tail', () => {
    // The liveness projection must see an enabled-but-fully-faded field as
    // INACTIVE (deep zoom: deriveVolumeLiveness goes null, both volume
    // layers disable), while a disabled field mid-fade-out stays ACTIVE so
    // its tail draws to completion — both from the single opacity test.
    const r = createVolumeFieldRenderer(deps(mockDevice()));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    expect(
      r.hasActiveFields(
        () => fullSettings({ enabled: true }),
        () => 0,
      ),
    ).toBe(false);
    expect(
      r.hasActiveFields(
        () => fullSettings({ enabled: false }),
        () => 0.5,
      ),
    ).toBe(true);
  });
});

const STEADY: DetailRegionDraw = {
  settledLo: [0.2, 0.2, 0.2],
  settledHi: [0.6, 0.6, 0.6],
  texScale: [1, 1, 1],
  voxelMpc: 1,
  fade: null,
};
const FADING: DetailRegionDraw = {
  ...STEADY,
  fade: { intoLo: [0, 0, 0], intoHi: [0, 0, 0], outLo: [0, 0, 0], outHi: [0, 0, 0], w: 0.5 },
};

// The march pipeline built with `REGION` = `variant` (and `LEVELS`), and the group 2 each draw bound.
function marchPipeline(device: GPUDevice, variant: number, levels = 0): unknown {
  const { calls, results } = vi.mocked(device.createRenderPipeline).mock;
  const at = calls.findIndex(
    ([desc]) =>
      desc.fragment?.constants?.REGION === variant && desc.fragment.constants.LEVELS === levels,
  );
  return results[at]?.value;
}
function placeholderGroup(device: GPUDevice): unknown {
  const { calls, results } = vi.mocked(device.createBindGroup).mock;
  return results[calls.findIndex(([desc]) => desc.label === 'density-region-placeholder')]?.value;
}
function drawWith(
  r: ReturnType<typeof createVolumeFieldRenderer>,
  region: DetailRegionDraw | null,
  showLevels = false,
): { pipeline: unknown; group2: unknown } {
  const pass = makeFakePass();
  r.draw(
    pass,
    new Float32Array(16) as unknown as Mat4,
    [320, 180],
    1000,
    [0, 0, 5],
    () => fullSettings({ showLevels }),
    () => 1,
    () => region,
    INPUTS,
  );
  const group2 = vi.mocked(pass.setBindGroup).mock.calls.find(([index]) => index === 2)?.[1];
  return { pipeline: vi.mocked(pass.setPipeline).mock.calls.at(-1)?.[0], group2 };
}

describe('createVolumeFieldRenderer detail regions', () => {
  const regionTexture = () =>
    ({ createView: vi.fn(() => ({})), destroy: vi.fn() }) as unknown as GPUTexture;

  it('a field with no region draws the base pipeline with the placeholder group 2', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.attachRegion('mcpm', regionTexture());
    const drawn = drawWith(r, null);
    expect(drawn.pipeline).toBe(marchPipeline(device, 0));
    expect(drawn.group2).toBe(placeholderGroup(device));
  });

  it('a region without a fade picks the steady pipeline; with a fade, the fading one', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.attachRegion('mcpm', regionTexture());
    const regionGroup = vi.mocked(device.createBindGroup).mock.results.at(-1)?.value;
    expect(drawWith(r, STEADY)).toEqual({
      pipeline: marchPipeline(device, 1),
      group2: regionGroup,
    });
    expect(drawWith(r, FADING)).toEqual({
      pipeline: marchPipeline(device, 2),
      group2: regionGroup,
    });
    expect(regionGroup).not.toBe(placeholderGroup(device));
  });

  // The debug view must cost nothing until it is turned on, and then pick the same REGION variant.
  it('showLevels draws the LEVELS twin of the chosen variant, built on first use only', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    const levelsBuilt = () =>
      vi
        .mocked(device.createRenderPipeline)
        .mock.calls.filter(([desc]) => desc.fragment?.constants?.LEVELS === 1).length;
    expect(levelsBuilt()).toBe(0);
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.attachRegion('mcpm', regionTexture());
    const fading = drawWith(r, FADING, true).pipeline;
    expect(fading).toBe(marchPipeline(device, 2, 1));
    expect(drawWith(r, FADING, true).pipeline).toBe(fading);
    expect(levelsBuilt()).toBe(1);
    expect(drawWith(r, STEADY, true).pipeline).toBe(marchPipeline(device, 1, 1));
    expect(drawWith(r, STEADY).pipeline).toBe(marchPipeline(device, 1));
  });

  it('a region value with no attached texture draws the base pipeline', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    expect(drawWith(r, FADING)).toEqual({
      pipeline: marchPipeline(device, 0),
      group2: placeholderGroup(device),
    });
  });

  it('attachRegion(id, null) drops the binding; a base re-upload keeps it; destroy never destroys a region texture', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    const texture = regionTexture();
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    r.attachRegion('mcpm', texture);
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    expect(drawWith(r, STEADY).pipeline).toBe(marchPipeline(device, 1));
    r.attachRegion('mcpm', null);
    expect(drawWith(r, STEADY).pipeline).toBe(marchPipeline(device, 0));
    r.attachRegion('mcpm', texture);
    r.unload('mcpm');
    r.destroy();
    expect(texture.destroy).not.toHaveBeenCalled();
  });
});
