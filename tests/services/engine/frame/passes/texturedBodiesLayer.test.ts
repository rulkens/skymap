/**
 * texturedBodiesLayer — unit tests for the `textured` branch of the body
 * partition.
 *
 * Load-bearing assertions, mirroring the other sphere-body layers:
 *
 *   1. The f64 seam — every textured body's MVP composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeBodyMvp`), and forwards
 *      the body's baked `orientation`.
 *   2. One `texturedBodyRenderer.draw(pass, bodyId, uniforms)` per textured
 *      body, each carrying the packed 24-float `TexturedBodyUniforms` block
 *      (`packTexturedBodyUniforms` is the SSOT).
 *   3. The ring ratios are DATA: Saturn packs its `SCENE_RINGS` radii in
 *      planet-radius units; a ringless body packs zeros (the fragment's "no
 *      ring" sentinel).
 *   4. The partition gate — a body is `textured` only when resolved AND its
 *      surface texture is resident; otherwise it is flat (drawn by
 *      `planetsLayer`, not here), so this layer's `enabled` is false.
 */

import { describe, it, expect, vi } from 'vitest';

import { texturedBodiesLayer } from '../../../../../src/services/engine/frame/passes/texturedBodiesLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../../src/data/bodies/sceneRings';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

// Mock composeBodyMvp so the test can assert which vp it consumed by identity
// and hand the renderer a recognisable Float32Array. The real composition math
// is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

const CTX_STUB = {} as ReadyFrameContext;

const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * A body of the given radius sitting `distanceKm` down +x from the origin.
 * `distanceKm = 5·radiusKm` subtends hundreds of px on the 720-tall/60° fixture
 * viewport (firmly resolved past the glint threshold).
 */
function bodyAt(id: string, radiusKm: number, orientation: Mat3 = IDENTITY_MAT3): PlanetBody {
  const distanceKm = radiusKm * 5;
  return {
    id,
    label: id,
    positionMpc: [distanceKm * SCALE_UNITS.KM_TO_MPC, 0, 0],
    radiusKm,
    albedo: [0.5, 0.5, 0.5],
    orientation,
  };
}

// Camera at the heliocentric origin, inside the foreground gate, 720-tall/60°.
function makeCtx(distance: number): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 3,
  } as unknown as ReadyFrameContext;
}

const NEAR_CTX = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);

function makeNear0View(): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: f64Vp,
    originRelative: true,
    precision: 'f64',
  };
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

/**
 * State with a `texturedBodyRenderer` handle, a seeded body list, and a
 * `bodyTextures` slot Map reporting the given ids resident (each slot's
 * `current()` returns a non-null bitmap stand-in).
 */
function makeState(
  renderer: unknown,
  bodies: readonly PlanetBody[],
  residentIds: readonly string[],
): EngineState {
  const bodyTextures = new Map(
    residentIds.map((id) => [id, { current: () => ({}) as ImageBitmap }]),
  );
  return {
    gpu: { texturedBodyRenderer: renderer },
    data: { bodies: { planets: bodies } },
    assetSlots: { bodyTextures },
  } as unknown as EngineState;
}

function makeRendererSpy() {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array) => void>(),
  };
}

describe('texturedBodiesLayer.enabled', () => {
  it('is false while the texturedBodyRenderer handle is null (bare ctx short-circuits)', () => {
    expect(texturedBodiesLayer.enabled(makeState(null, [], []), CTX_STUB)).toBe(false);
  });

  it('is false beyond the foreground gate even with a resident resolved body', () => {
    const state = makeState(makeRendererSpy(), [bodyAt('mars', 3390)], ['mars']);
    expect(texturedBodiesLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
  });

  it('is false when a resolved registry body is NOT resident (it is flat, drawn by planetsLayer)', () => {
    // Body present + resolved but its texture has not committed → the partition
    // routes it to `flat`, so this layer draws nothing.
    const state = makeState(makeRendererSpy(), [bodyAt('mars', 3390)], []);
    expect(texturedBodiesLayer.enabled(state, NEAR_CTX)).toBe(false);
  });

  it('is true when a resolved registry body is resident', () => {
    const state = makeState(makeRendererSpy(), [bodyAt('mars', 3390)], ['mars']);
    expect(texturedBodiesLayer.enabled(state, NEAR_CTX)).toBe(true);
  });
});

describe('texturedBodiesLayer.draw', () => {
  it('composes each textured body from the slab f64 vp with its orientation and draws length-24 uniforms', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const marsOrient: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const mars = bodyAt('mars', 3390, marsOrient);
    const jupiter = bodyAt('jupiter', 69911);
    const state = makeState(renderer, [mars, jupiter], ['mars', 'jupiter']);

    texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    // One MVP composed per textured body, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(2);
    [mars, jupiter].forEach((body, i) => {
      const call = composeMock.mock.calls[i]!;
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(body.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(body.radiusKm * SCALE_UNITS.KM_TO_MPC);
      expect(call[4]).toBe(body.orientation);
    });

    // One per-body draw, in seed order, each with the packed 24-float record.
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    const [p0, id0, u0] = renderer.draw.mock.calls[0]!;
    expect(p0).toBe(PASS_STUB);
    expect(id0).toBe('mars');
    expect(u0).toBeInstanceOf(Float32Array);
    expect(u0).toHaveLength(24);
    expect(renderer.draw.mock.calls[1]![1]).toBe('jupiter');

    // sunDirLocal is packed at floats 16..18 (recomputed independently, NOT
    // through the layer, so a drift in the rotate/pack lands here).
    const expectedSun = sunDirLocal(mars.positionMpc, RENDER_ORIGIN_MPC, mars.orientation);
    expect(u0[16]).toBeCloseTo(expectedSun[0]);
    expect(u0[17]).toBeCloseTo(expectedSun[1]);
    expect(u0[18]).toBeCloseTo(expectedSun[2]);
  });

  it('packs Saturn`s SCENE_RINGS radii as ring ratios and zeros for a ringless body', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const saturn = bodyAt('saturn', 58232);
    const mars = bodyAt('mars', 3390);
    const state = makeState(renderer, [saturn, mars], ['saturn', 'mars']);

    texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    const ring = SCENE_RINGS.find((r) => r.bodyId === 'saturn')!;
    const [, , saturnU] = renderer.draw.mock.calls[0]!;
    // Ring ratios at floats 20 (inner) and 21 (outer), planet-radius units.
    expect(saturnU[20]).toBeCloseTo(ring.innerRadiusKm / saturn.radiusKm);
    expect(saturnU[21]).toBeCloseTo(ring.outerRadiusKm / saturn.radiusKm);

    const [, , marsU] = renderer.draw.mock.calls[1]!;
    // Ringless body: the "no ring" sentinel (0) at both ratio slots.
    expect(marsU[20]).toBe(0);
    expect(marsU[21]).toBe(0);
  });

  it('is a no-op when the texturedBodyRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null, [bodyAt('mars', 3390)], ['mars']);
    expect(() => texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state)).not.toThrow();
  });
});
