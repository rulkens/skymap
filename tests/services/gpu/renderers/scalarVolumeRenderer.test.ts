import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import {
  buildCubeModelMatrix,
  createScalarVolumeRenderer,
} from '../../../../src/services/gpu/renderers/scalarVolumeRenderer';
import { getVolumeFieldDefaults } from '../../../../src/data/volumeFieldDefaults';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

function fixture(overrides: Partial<ScalarCube> = {}): ScalarCube {
  return {
    dims: [4, 4, 4],
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
 * the renderer makes during construction + addField must return a
 * plausibly-shaped stand-in.  Draw tests assert on recorded
 * `device.queue.writeBuffer` / `device.queue.writeTexture` mock calls
 * — the uniform scratch the renderer packs per field, and the palette
 * LUT re-uploads it issues when `settingsOf` returns a changed
 * `paletteId`.  Modelled after the mock in
 * `tests/services/gpu/passes/postProcess.test.ts`.
 */
function mockDevice(): GPUDevice {
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
    createRenderPipeline: vi.fn(() => ({
      // The renderer derives its bind-group layout from the pipeline (it
      // uses `layout: 'auto'`); mock returns an empty layout the test
      // never inspects.
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

/** Stub callbacks for createScalarVolumeRenderer — avoids FadeRegistry dep in tests. */
function stubCallbacks() {
  return {
    onFieldAdded: vi.fn(),
    onFieldRemoved: vi.fn(),
  };
}

describe('buildCubeModelMatrix', () => {
  it('maps unit-cube corner (0,0,0) to the cube origin in world space', () => {
    const m = buildCubeModelMatrix(fixture());
    // m * [0,0,0,1] should equal [origin, 1].  Column-major mat4 ⇒
    // translation lives in elements 12..14.
    expect(m[12]).toBeCloseTo(-100);
    expect(m[13]).toBeCloseTo(-100);
    expect(m[14]).toBeCloseTo(-100);
  });

  it('maps unit-cube corner (1,1,1) to origin + dims*voxelSize', () => {
    const m = buildCubeModelMatrix(fixture());
    // Apply m to [1,1,1,1]: the result is origin + dims*voxelSize on
    // each axis.  For an identity rotation and equatorial frame, that's
    // a clean (-100 + 4*50, -100 + 4*50, -100 + 4*50) = (100, 100, 100).
    const x = m[0]! + m[4]! + m[8]! + m[12]!;
    const y = m[1]! + m[5]! + m[9]! + m[13]!;
    const z = m[2]! + m[6]! + m[10]! + m[14]!;
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(100);
    expect(z).toBeCloseTo(100);
  });

  it('applies the supergalactic→equatorial rotation when frameKind is supergalactic', () => {
    const m = buildCubeModelMatrix(fixture({ frameKind: 'supergalactic-cartesian' }));
    // The rotation is non-identity, so the upper-left 3x3 should not
    // be a pure scale matrix.  Specifically, off-diagonal entries should
    // be non-zero (the rotation mixes axes).
    const offDiag = Math.abs(m[1]!) + Math.abs(m[2]!) + Math.abs(m[4]!) + Math.abs(m[6]!);
    expect(offDiag).toBeGreaterThan(0.01);
  });

  it('keeps an observer-centered cube centred under non-identity rotation', () => {
    // 90° rotation around the Z axis as a unit quaternion (x, y, z, w).
    // The cube fixture is observer-centred (origin = -dims*voxelSize/2),
    // so its geometric centre sits at the native frame's origin.  Under
    // ANY rotation about that origin, the centre must remain at (0,0,0)
    // in native space — and after FRAME_TO_WORLD identity (equatorial
    // frame here) at (0,0,0) in world space too.
    //
    // The previous matrix order (translate-then-rotate) failed this:
    // it pivoted the cube around its corner rather than its centre,
    // so the centre ended up at `R*(-origin) + origin ≠ origin` for any
    // non-identity R.  The current order (rotate-then-translate, with
    // gl-matrix's post-multiply semantics: copy → R → T → S) fixes it.
    const s = Math.SQRT1_2;
    const m = buildCubeModelMatrix(fixture({ rotation: [0, 0, s, s] }));
    // Apply m to the unit-cube centre (0.5, 0.5, 0.5, 1).  Column-major
    // mat4 means m[col*4 + row]; the (cx, cy, cz) below is the standard
    // dot of each row with the homogeneous coordinate.
    const cx = m[0]! * 0.5 + m[4]! * 0.5 + m[8]! * 0.5 + m[12]!;
    const cy = m[1]! * 0.5 + m[5]! * 0.5 + m[9]! * 0.5 + m[13]!;
    const cz = m[2]! * 0.5 + m[6]! * 0.5 + m[10]! * 0.5 + m[14]!;
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(0, 5);
    expect(cz).toBeCloseTo(0, 5);
  });
});

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
  const calls = (device.queue.writeBuffer as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const hit = calls.find((c) => c[2] instanceof Float32Array && (c[2] as Float32Array).length === 64);
  return hit?.[2] as Float32Array | undefined;
}

describe('createScalarVolumeRenderer draw', () => {
  it('draw reads field values from settingsOf', () => {
    const device = mockDevice();
    const r = createScalarVolumeRenderer(device, 'bgra8unorm', {} as never, stubCallbacks());
    r.addField('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
    );
    const s = uniformScratch(device);
    expect(s?.[55]).toBeCloseTo(0.9);   // intensity
    expect(s?.[57]).toBeCloseTo(4);     // contrast
    expect(s?.[56]).toBeCloseTo(2);     // densityScale
    expect(s?.[61]).toBeCloseTo(3);     // exposure
    expect(s?.[62]).toBeCloseTo(0.1);   // trim
  });

  it('draw skips a field with no settings row', () => {
    // When `settingsOf` returns undefined the renderer has no tunable
    // state for that field and must not issue any GPU work.
    const device = mockDevice();
    const r = createScalarVolumeRenderer(device, 'bgra8unorm', {} as never, stubCallbacks());
    r.addField('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => undefined,
      () => 1,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
    expect(uniformScratch(device)).toBeUndefined();
  });

  it('addField seeds contrastCenter / envelope from the registry', () => {
    // Per-cube static config read from the registry once at addField;
    // user-tunable knobs are absent from the entry and arrive per draw
    // via settingsOf.
    const device = mockDevice();
    const r = createScalarVolumeRenderer(device, 'bgra8unorm', {} as never, stubCallbacks());
    r.addField('mcpm', fixture());
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings(),
      () => 1,
    );
    const s = uniformScratch(device);
    const defs = getVolumeFieldDefaults('mcpm');
    expect(s?.[58]).toBeCloseTo(defs.contrastCenter);      // contrastCenter
    expect(s?.[59]).toBeCloseTo(defs.envelope.inner);      // envelopeInner
    expect(s?.[60]).toBeCloseTo(defs.envelope.outer);      // envelopeOuter
  });

  it('draw re-uploads the LUT once when settingsOf paletteId changes', () => {
    // First draw with the registry-default palette — no extra upload
    // (the LUT was already seeded in addField).  Second draw with a
    // different palette — exactly one writeTexture.  Third draw with
    // the same changed palette — no further writeTexture (resident
    // now tracks the new id).
    const device = mockDevice();
    const r = createScalarVolumeRenderer(device, 'bgra8unorm', {} as never, stubCallbacks());
    r.addField('mcpm', fixture());
    const before = (device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    // Draw with the registry-default palette (already resident).
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: getVolumeFieldDefaults('mcpm').paletteId }),
      () => 1,
    );
    expect((device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before);
    // Draw with a different palette — mcpm defaults to 'inferno', so 'viridis' diverges.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
    );
    expect((device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before + 1);
    // Draw again with 'viridis' — already resident, no further upload.
    r.draw(
      makeFakePass(),
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ paletteId: 'viridis' }),
      () => 1,
    );
    expect((device.queue.writeTexture as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before + 1);
  });

  it('draw on a disabled, fully-faded field does not draw', () => {
    // enabled:false + fadeOpacityOf returning 0 → the field is fully
    // off; no GPU work should be issued.
    const device = mockDevice();
    const r = createScalarVolumeRenderer(device, 'bgra8unorm', {} as never, stubCallbacks());
    r.addField('mcpm', fixture());
    const pass = makeFakePass();
    r.draw(
      pass,
      new Float32Array(16) as unknown as mat4,
      [320, 180],
      [0, 0, 5],
      () => fullSettings({ enabled: false }),
      () => 0,
    );
    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });
});
