import { describe, it, expect, vi } from 'vitest';
import { createScalarVolumeRenderer } from '../../../../src/services/gpu/renderers/scalarVolumeRenderer';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';

function fixture(overrides: Partial<ScalarCube> = {}): ScalarCube {
  return {
    dims: [4, 4, 4],
    channels: 1,
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
 * Minimal GPUDevice mock for renderer-construction tests.
 *
 * Vitest runs in Node without a real WebGPU surface; every device call
 * the renderer makes during construction + addField must return a
 * plausibly-shaped stand-in.  The returned objects are never inspected
 * by the renderer itself — we only care that the setter mutates the
 * tracked in-memory state, which is read back via the test-only
 * `__getFieldEntryForTest` accessor.  Modelled after the mock in
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

describe('createScalarVolumeRenderer setters', () => {
  // These tests exercise the public setter surface (specifically the
  // densityScale plumbing introduced for SCFD v2 — see plan
  // 2026-05-11-scfd-v2-presentation-defaults).  They construct a real
  // renderer against a mocked GPUDevice and read back the per-field
  // entry via the test-only `__getFieldEntryForTest` accessor.  No GPU
  // queue work is asserted because the renderer holds the value on the
  // CPU until the next `draw` call composes a uniform buffer; the
  // mutation contract IS the test surface.

  it('setDensityScale mutates the field entry for the given handle', () => {
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', 7.5);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBeCloseTo(7.5, 6);
  });

  it('setDensityScale clamps negative inputs to 0', () => {
    // Negative densityScale is meaningless under the alpha-integral
    // formula and would invert colour mapping.  The renderer collapses
    // it to 0 (a silent overlay) rather than throwing — same forgiving
    // pattern as setIntensity / setContrast.
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', -3);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBe(0);
  });

  it('setDensityScale clamps NaN inputs to 0', () => {
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', Number.NaN);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBe(0);
  });

  it('setDensityScale on an unknown handle is a no-op', () => {
    // Mirrors the existing setContrast / setIntensity contract: a
    // late-firing settings callback for a removed field must not throw.
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    expect(() => renderer.setDensityScale('nope', 1.0)).not.toThrow();
  });

  it('addField seeds a no-envelope sentinel (both edges past the cube corner)', () => {
    // The wireSlots commit overwrites envelope via setEnvelope right
    // after addField returns — but tests that go directly through
    // addField (and any future production caller that bypasses
    // wireSlots) should get a visually-identity envelope by default,
    // not a silently-cropped cube.
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    const e = renderer.__getFieldEntryForTest('h');
    expect(e?.envelopeInner).toBeGreaterThanOrEqual(Math.sqrt(3));
    expect(e?.envelopeOuter).toBeGreaterThanOrEqual(Math.sqrt(3));
  });

  it('setEnvelope writes both edges through to the field entry', () => {
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    renderer.setEnvelope('h', 0.9, 1.0);
    const e = renderer.__getFieldEntryForTest('h');
    expect(e?.envelopeInner).toBeCloseTo(0.9, 6);
    expect(e?.envelopeOuter).toBeCloseTo(1.0, 6);
  });

  it('setEnvelope replaces NaN / non-finite inputs with the no-envelope sentinel', () => {
    // A bad input would otherwise propagate to the uniform buffer and
    // produce undefined sampling behaviour in the shader.  Safer to
    // silently fall back to the visual identity (no envelope) than to
    // render garbage; matches the forgiving pattern of the sibling
    // setters.
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    renderer.addField('h', fixture());
    renderer.setEnvelope('h', Number.NaN, Infinity);
    const e = renderer.__getFieldEntryForTest('h');
    expect(e?.envelopeInner).toBeGreaterThanOrEqual(Math.sqrt(3));
    expect(e?.envelopeOuter).toBeGreaterThanOrEqual(Math.sqrt(3));
  });

  it('setEnvelope on an unknown handle is a no-op', () => {
    const renderer = createScalarVolumeRenderer(
      mockDevice(),
      'bgra8unorm',
      {} as never,
      stubCallbacks(),
    );
    expect(() => renderer.setEnvelope('nope', 0.9, 1.0)).not.toThrow();
  });
});
