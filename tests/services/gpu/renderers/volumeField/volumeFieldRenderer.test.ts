import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { createVolumeFieldRenderer } from '../../../../../src/services/gpu/renderers/volumeField/volumeFieldRenderer';
import { MCPM_ENTRY } from '../../../../../src/layers/cosmicWebDensity/sources/mcpm';
import type { ScalarCube } from '../../../../../packages/shared/src/@types/data/volume/ScalarCube';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';
import type { VolumeFieldDrawInputs } from '../../../../../src/@types/rendering/VolumeFieldDrawInputs';
import type { VolumeFieldRendererDeps } from '../../../../../src/@types/rendering/VolumeFieldRendererDeps';

function fixture(overrides: Partial<ScalarCube> = {}): ScalarCube {
  return {
    dims: [4, 4, 4],
    channels: 1, // density cube — SCFD v3 made `channels` a required field
    voxels: new Uint16Array(64),
    frameKind: 'equatorial-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 50,
    rotation: [0, 0, 0, 1],
    valueMin: 0,
    valueMax: 1,
    ...overrides,
  };
}

/**
 * Minimal GPUDevice mock for renderer construction and draw tests.
 *
 * Vitest runs in Node without a real WebGPU surface; every device call
 * the renderer makes during construction + upload must return a
 * plausibly-shaped stand-in.  Draw tests assert on recorded
 * `device.queue.writeBuffer` / `device.queue.writeTexture` mock calls
 * — the uniform scratch the renderer packs per field, and the palette
 * LUT re-uploads it issues when `settingsOf` returns a changed
 * `paletteId`.  Modelled after the mock-device pattern in
 * `tests/services/gpu/renderTargets.test.ts`.
 */
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
      // The renderer derives its bind-group layout from the pipeline (it
      // uses `layout: 'auto'`); mock returns an empty layout the test
      // never inspects.
      return { getBindGroupLayout: vi.fn(() => ({})) };
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

// ── Draw-path helpers ────────────────────────────────────────────────

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

/**
 * Extract the length-68 uniform scratch from the writeBuffer mock.
 * The fade write passes a 16-byte ArrayBuffer — we skip it and find
 * only the Float32Array(68) that packs the full per-field uniform.
 */
function uniformScratch(device: GPUDevice): Float32Array | undefined {
  const calls = (device.queue.writeBuffer as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  const hit = calls.find(
    (c) => c[2] instanceof Float32Array && (c[2] as Float32Array).length === 68,
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
    // Per-cube static config taken from `upload`'s `statics` argument;
    // user-tunable knobs are absent from it and arrive per draw via
    // settingsOf. The renderer names no registry — any id is valid as long
    // as the caller supplies statics, which is what makes a second caller
    // (a future dust volume on its own ids) possible without widening this
    // renderer's id union.
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
      INPUTS,
    );
    const s = uniformScratch(device);
    expect(s?.[58]).toBeCloseTo(statics.contrastCenter); // contrastCenter
    expect(s?.[59]).toBeCloseTo(statics.envelope.inner); // envelopeInner
    expect(s?.[60]).toBeCloseTo(statics.envelope.outer); // envelopeOuter
  });

  it('draw re-uploads the LUT once when settingsOf paletteId changes', () => {
    // First draw with the statics-seeded default palette — no extra upload
    // (the LUT was already seeded in upload).  Second draw with a
    // different palette — exactly one writeTexture.  Third draw with
    // the same changed palette — no further writeTexture (resident
    // now tracks the new id).
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
      INPUTS,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before + 1);
  });

  it('draw skips an ENABLED field whose resolved opacity is 0', () => {
    // Opacity is the sole visibility truth: an enabled field spatially faded
    // to 0 (the deep-zoom band) must not burn a raymarch. The old rule let
    // `enabled` override a zero opacity and drew anyway.
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
      { ...INPUTS, jitterIndex: 1_000_005 },
    );
    expect(uniformScratch(device)?.[63]).toBe(5);
  });

  // The spike decayed the target once per field, so every field faded the ones before it (MCPM
  // −65% with 2MRS on). One decay, then every field adds at w: dst·(1−w) + w·Σ fields. The blend
  // constant must be set too: WebGPU's default of 0 erases the volume.
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
      INPUTS,
    );
    expect(pass.draw).not.toHaveBeenCalled();
    expect(pass.drawIndexed).toHaveBeenCalledOnce();
  });
});

/**
 * Recovers the actual mock instances `device.createTexture` /
 * `device.createBuffer` returned, in call order — each call in
 * `mockDevice` returns a fresh object with its own `destroy: vi.fn()`,
 * so a snapshot taken right after `upload()` lets a test assert
 * `destroy` on the SPECIFIC resource rather than on any texture/buffer.
 */
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
    INPUTS,
  );
  return (pass.drawIndexed as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe('createVolumeFieldRenderer unload / re-upload', () => {
  it("unload destroys the field's four GPU resources and drops it from the map", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    // upload() creates textures [volumeTexture, paletteTexture] (the only
    // createTexture calls) and, last among buffers, [uniformBuffer, fadeBuffer]
    // — the factory itself already created cornerBuffer/indexBuffer, so the
    // last two createBuffer results are the ones upload() just made.
    const [volumeTexture, paletteTexture] = createdTextures(device);
    const [uniformBuffer, fadeBuffer] = createdBuffers(device).slice(-2);
    r.unload('mcpm');
    expect(volumeTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(paletteTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(uniformBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fadeBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fieldsDrawn(r)).toBe(0);
  });

  it("re-uploading the same id destroys the previous field's resources first", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(deps(device));
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    const [volumeTexture, paletteTexture] = createdTextures(device);
    const [uniformBuffer, fadeBuffer] = createdBuffers(device).slice(-2);
    r.upload('mcpm', fixture(), MCPM_ENTRY);
    expect(volumeTexture!.destroy).toHaveBeenCalledTimes(1);
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
