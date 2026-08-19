import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { createVolumeFieldRenderer } from '../../../../../src/services/gpu/renderers/volumeField/volumeFieldRenderer';
import { getVolumeFieldDefaults } from '../../../../../src/data/volume/volumeFieldDefaults';
import type { ScalarCube } from '../../../../../src/@types/data/volume/ScalarCube';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';

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

// ── Draw-path helpers ────────────────────────────────────────────────

function makeFakePass() {
  return {
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function fullSettings(overrides: Record<string, unknown> = {}): VolumeFieldSettings {
  return {
    enabled: true,
    intensity: 0.9,
    contrast: 4,
    densityScale: 2,
    paletteId: getVolumeFieldDefaults('mcpm').paletteId,
    trim: 0.1,
    exposure: 3,
    ...overrides,
  } as VolumeFieldSettings;
}

/**
 * Extract the length-64 uniform scratch from the writeBuffer mock.
 * The fade write passes a 16-byte ArrayBuffer — we skip it and find
 * only the Float32Array(64) that packs the full per-field uniform.
 */
function uniformScratch(device: GPUDevice): Float32Array | undefined {
  const calls = (device.queue.writeBuffer as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  const hit = calls.find(
    (c) => c[2] instanceof Float32Array && (c[2] as Float32Array).length === 64,
  );
  return hit?.[2] as Float32Array | undefined;
}

describe('createVolumeFieldRenderer colour target', () => {
  it('bakes the given targetFormat into the raymarch pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createVolumeFieldRenderer(mockDevice(renderPipelines), 'rgba16float', {} as never);
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('createVolumeFieldRenderer draw', () => {
  it('draw reads field values from settingsOf', () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
    );
    const s = uniformScratch(device);
    expect(s?.[55]).toBeCloseTo(0.9); // intensity
    expect(s?.[57]).toBeCloseTo(4); // contrast
    expect(s?.[56]).toBeCloseTo(2); // densityScale
    expect(s?.[61]).toBeCloseTo(3); // exposure
    expect(s?.[62]).toBeCloseTo(0.1); // trim
  });

  it('draw skips a field with no settings row', () => {
    // When `settingsOf` returns undefined the renderer has no tunable
    // state for that field and must not issue any GPU work.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => undefined,
      () => 1,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(uniformScratch(device)).toBeUndefined();
  });

  it('upload seeds contrastCenter / envelope from the registry', () => {
    // Per-cube static config read from the registry once at upload;
    // user-tunable knobs are absent from the entry and arrive per draw
    // via settingsOf.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
    );
    const s = uniformScratch(device);
    const defs = getVolumeFieldDefaults('mcpm');
    expect(s?.[58]).toBeCloseTo(defs.contrastCenter); // contrastCenter
    expect(s?.[59]).toBeCloseTo(defs.envelope.inner); // envelopeInner
    expect(s?.[60]).toBeCloseTo(defs.envelope.outer); // envelopeOuter
  });

  it('draw re-uploads the LUT once when settingsOf paletteId changes', () => {
    // First draw with the registry-default palette — no extra upload
    // (the LUT was already seeded in upload).  Second draw with a
    // different palette — exactly one writeTexture.  Third draw with
    // the same changed palette — no further writeTexture (resident
    // now tracks the new id).
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const before = (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    // Draw with the registry-default palette (already resident).
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: getVolumeFieldDefaults('mcpm').paletteId }),
      () => 1,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before);
    // Draw with a different palette — mcpm defaults to 'inferno', so 'viridis' diverges.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before + 1);
    // Draw again with 'viridis' — already resident, no further upload.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
    );
    expect(
      (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(before + 1);
  });

  it('draw on a disabled, fully-faded field does not draw', () => {
    // enabled:false + fadeOpacityOf returning 0 → the field is fully
    // off; no GPU work should be issued.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ enabled: false }),
      () => 0,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('draw skips an ENABLED field whose resolved opacity is 0', () => {
    // Opacity is the sole visibility truth: an enabled field spatially faded
    // to 0 (the deep-zoom band) must not burn a raymarch. The old rule let
    // `enabled` override a zero opacity and drew anyway.
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ enabled: true }),
      () => 0,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(uniformScratch(device)).toBeUndefined();
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

describe('createVolumeFieldRenderer unload / re-upload', () => {
  it("unload destroys the field's four GPU resources and drops it from the map", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
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
    expect(r.listIds()).not.toContain('mcpm');
  });

  it("re-uploading the same id destroys the previous field's resources first", () => {
    const device = mockDevice();
    const r = createVolumeFieldRenderer(device, 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
    const [volumeTexture, paletteTexture] = createdTextures(device);
    const [uniformBuffer, fadeBuffer] = createdBuffers(device).slice(-2);
    r.upload('mcpm', fixture());
    expect(volumeTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(paletteTexture!.destroy).toHaveBeenCalledTimes(1);
    expect(uniformBuffer!.destroy).toHaveBeenCalledTimes(1);
    expect(fadeBuffer!.destroy).toHaveBeenCalledTimes(1);
    // The replace, not an add: exactly one 'mcpm' entry survives.
    expect(r.listIds()).toEqual(['mcpm']);
  });
});

describe('createVolumeFieldRenderer hasActiveFields', () => {
  it('is false when the only enabled field has opacity 0, true through a fade-out tail', () => {
    // The liveness projection must see an enabled-but-fully-faded field as
    // INACTIVE (deep zoom: deriveVolumeLiveness goes null, both volume
    // layers disable), while a disabled field mid-fade-out stays ACTIVE so
    // its tail draws to completion — both from the single opacity test.
    const r = createVolumeFieldRenderer(mockDevice(), 'bgra8unorm', {} as never);
    r.upload('mcpm', fixture());
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
