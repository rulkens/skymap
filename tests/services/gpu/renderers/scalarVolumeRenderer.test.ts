import { describe, it, expect, vi } from 'vitest';
import {
  buildCubeModelMatrix,
  createScalarVolumeRenderer,
} from '../../../../src/services/gpu/renderers/scalarVolumeRenderer';
import type { ScalarCube } from '../../../../src/@types/data/ScalarCube';

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
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', 7.5);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBeCloseTo(7.5, 6);
  });

  it('setDensityScale clamps negative inputs to 0', () => {
    // Negative densityScale is meaningless under the alpha-integral
    // formula and would invert colour mapping.  The renderer collapses
    // it to 0 (a silent overlay) rather than throwing — same forgiving
    // pattern as setIntensity / setContrast.
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', -3);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBe(0);
  });

  it('setDensityScale clamps NaN inputs to 0', () => {
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    renderer.addField('h', fixture());
    renderer.setDensityScale('h', Number.NaN);
    expect(renderer.__getFieldEntryForTest('h')?.densityScale).toBe(0);
  });

  it('setDensityScale on an unknown handle is a no-op', () => {
    // Mirrors the existing setContrast / setIntensity contract: a
    // late-firing settings callback for a removed field must not throw.
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    expect(() => renderer.setDensityScale('nope', 1.0)).not.toThrow();
  });

  it('addField seeds a no-envelope sentinel (both edges past the cube corner)', () => {
    // The wireSlots commit overwrites envelope via setEnvelope right
    // after addField returns — but tests that go directly through
    // addField (and any future production caller that bypasses
    // wireSlots) should get a visually-identity envelope by default,
    // not a silently-cropped cube.
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    renderer.addField('h', fixture());
    const e = renderer.__getFieldEntryForTest('h');
    expect(e?.envelopeInner).toBeGreaterThanOrEqual(Math.sqrt(3));
    expect(e?.envelopeOuter).toBeGreaterThanOrEqual(Math.sqrt(3));
  });

  it('setEnvelope writes both edges through to the field entry', () => {
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
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
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    renderer.addField('h', fixture());
    renderer.setEnvelope('h', Number.NaN, Infinity);
    const e = renderer.__getFieldEntryForTest('h');
    expect(e?.envelopeInner).toBeGreaterThanOrEqual(Math.sqrt(3));
    expect(e?.envelopeOuter).toBeGreaterThanOrEqual(Math.sqrt(3));
  });

  it('setEnvelope on an unknown handle is a no-op', () => {
    const renderer = createScalarVolumeRenderer(mockDevice(), 'bgra8unorm');
    expect(() => renderer.setEnvelope('nope', 0.9, 1.0)).not.toThrow();
  });
});
