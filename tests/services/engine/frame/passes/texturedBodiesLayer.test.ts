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
 *      body, each carrying the packed 28-float `TexturedBodyUniforms` block
 *      (`packTexturedBodyUniforms` is the SSOT).
 *   3. The ring ratios are DATA: Saturn packs its `SCENE_RINGS` radii in
 *      planet-radius units; a ringless body packs zeros (the fragment's "no
 *      ring" sentinel).
 *   4. The partition gate — a body is `textured` only when resolved AND its
 *      surface texture is resident; otherwise it is flat (drawn by
 *      `planetsLayer`, not here), so this layer's `enabled` is false.
 *   5. Minnaert limb darkening is DATA: a body with a `LIMB_DARKENING_PARAMS`
 *      row packs its strength/exponent (floats 22/23); an absent body packs the
 *      identity (0/1). Each body packs its body-local camera (`camPosLocal`,
 *      floats 24..26) at its surface radius — recomputed here to catch a drift.
 */

import { describe, it, expect, vi } from 'vitest';

import { texturedBodiesLayer } from '../../../../../src/services/engine/frame/passes/texturedBodiesLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../../src/data/bodies/sceneRings';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { LIMB_DARKENING_PARAMS } from '../../../../../src/data/bodies/limbDarkeningParams';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../../src/utils/camera/camPosLocal';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { TextureKind } from '../../../../../src/@types/data/TextureKind';

// Mock composeBodyMvp so the test can assert which vp it consumed by identity
// and hand the layer a recognisable Float64Array — real composeBodyMvp returns
// f64; the layer narrows its own copy at the GPU-upload boundary. The real
// composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

// The layer reads each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id). Stub it to a map built from the fixture
// bodies, REUSING each record's own positionMpc/orientation refs — so the layer
// sees the exact fixture values (identity-equal), keeping the `toBe(...)`
// assertions below intact while the reads move off the baked record fields.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededPlanet | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

// A test fixture pairing the identity record with the J2000 state the snapshot
// carries — position + orientation were lifted off the record onto the derive, so
// the fixture supplies them here (keyed by id, refs reused by the mock above).
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;

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
 * A body of the given radius sitting `distanceM` down +x from the origin.
 * `distanceM = 5·radiusM` subtends hundreds of px on the 720-tall/60° fixture
 * viewport (firmly resolved past the glint threshold).
 */
function bodyAt(id: string, radiusM: number, orientation: Mat3 = IDENTITY_MAT3): SeededPlanet {
  const distanceM = radiusM * 5;
  return {
    id,
    label: id,
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
    radiusM,
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
  const slab: Slab = makeSlab({ vp: f64Vp });
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

/**
 * State with a `texturedBodyRenderer` handle and a seeded body list.
 * Residency now lives on the renderer's `hasMap` (see `makeRendererSpy`), not
 * on an asset slot — this fixture no longer seeds `assetSlots.bodyTextures`.
 */
function makeState(renderer: unknown, bodies: readonly PlanetBody[]): EngineState {
  return {
    gpu: { texturedBodyRenderer: renderer },
    data: { bodies: { planets: bodies } },
  } as unknown as EngineState;
}

/**
 * A `texturedBodyRenderer` spy whose `hasMap('surface')` reports resident for
 * exactly the given ids — the fake's stand-in for "a real surface texture is
 * bound", now a rendering fact asked of the renderer instead of inferred from
 * a loading-system slot.
 */
function makeRendererSpy(residentIds: readonly string[] = []) {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array) => void>(),
    hasMap: vi.fn(
      (id: string, kind: TextureKind) => kind === 'surface' && residentIds.includes(id),
    ),
  };
}

describe('texturedBodiesLayer.enabled', () => {
  it('is false while the texturedBodyRenderer handle is null (bare ctx short-circuits)', () => {
    expect(texturedBodiesLayer.enabled(makeState(null, []), CTX_STUB, makeNear0View())).toBe(false);
  });

  it('is false beyond the foreground gate even with a resident resolved body', () => {
    const state = makeState(makeRendererSpy(['mars']), [bodyAt('mars', 3390000)]);
    expect(
      texturedBodiesLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC), makeNear0View()),
    ).toBe(false);
  });

  it('is false when a resolved registry body is NOT resident (it is flat, drawn by planetsLayer)', () => {
    // Body present + resolved but its texture has not committed → hasMap says
    // not resident → the partition routes it to `flat`, so this layer draws
    // nothing.
    const state = makeState(makeRendererSpy([]), [bodyAt('mars', 3390000)]);
    expect(texturedBodiesLayer.enabled(state, NEAR_CTX, makeNear0View())).toBe(false);
  });

  it('is true when a resolved registry body is resident', () => {
    const state = makeState(makeRendererSpy(['mars']), [bodyAt('mars', 3390000)]);
    expect(texturedBodiesLayer.enabled(state, NEAR_CTX, makeNear0View())).toBe(true);
  });
});

describe('texturedBodiesLayer.draw', () => {
  it('composes each textured body from the slab f64 vp with its orientation and draws length-28 uniforms', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy(['mars', 'jupiter']);
    const view = makeNear0View();
    const marsOrient: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const mars = bodyAt('mars', 3390000, marsOrient);
    const jupiter = bodyAt('jupiter', 69911000);
    const state = makeState(renderer, [mars, jupiter]);

    texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    // One MVP composed per textured body, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(2);
    [mars, jupiter].forEach((body, i) => {
      const call = composeMock.mock.calls[i]!;
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(body.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(body.radiusM * SCALE_UNITS.M_TO_MPC);
      expect(call[4]).toBe(body.orientation);
    });

    // One per-body draw, in seed order, each with the packed 28-float record.
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    const [p0, id0, u0] = renderer.draw.mock.calls[0]!;
    expect(p0).toBe(PASS_STUB);
    expect(id0).toBe('mars');
    expect(u0).toBeInstanceOf(Float32Array);
    expect(u0).toHaveLength(28);
    expect(renderer.draw.mock.calls[1]![1]).toBe('jupiter');

    // sunDirLocal is packed at floats 16..18 (recomputed independently, NOT
    // through the layer, so a drift in the rotate/pack lands here).
    const expectedSun = sunDirLocal(mars.positionMpc, RENDER_ORIGIN_MPC, mars.orientation);
    expect(u0[16]).toBeCloseTo(expectedSun[0]);
    expect(u0[17]).toBeCloseTo(expectedSun[1]);
    expect(u0[18]).toBeCloseTo(expectedSun[2]);

    // Minnaert limb params are DATA-gated: mars (no LIMB_DARKENING_PARAMS row)
    // packs the identity (strength 0, exponent 1 — a no-op factor); jupiter (a
    // row) packs its authored strength/exponent at floats 22/23. Read from the
    // table, not restated, so a value tweak does not touch this test.
    expect(u0[22]).toBe(0); // mars limbStrength — absent ⇒ identity
    expect(u0[23]).toBe(1); // mars limbExponent — absent ⇒ identity
    const u1 = renderer.draw.mock.calls[1]![2];
    expect(u1[22]).toBeCloseTo(LIMB_DARKENING_PARAMS.jupiter!.strength);
    expect(u1[23]).toBeCloseTo(LIMB_DARKENING_PARAMS.jupiter!.exponent);

    // camPosLocal at floats 24..26 — recomputed independently (NOT through the
    // layer) at the body's SURFACE radius, so a drift in the derivation lands
    // here, the same posture as the sun-at-16..18 assertion above. Mars carries a
    // non-identity orientation, so this also exercises the local-frame rotate.
    // Exact `Math.fround` equality (not `toBeCloseTo`): the layer's value and the
    // recompute are the SAME double through the SAME util, differing only by the
    // packer's f32 narrowing — and these body-radii magnitudes are far too large
    // for `toBeCloseTo`'s absolute tolerance to mean anything.
    const expectedCam = camPosLocal(
      view.camPos,
      mars.positionMpc,
      mars.radiusM * SCALE_UNITS.M_TO_MPC,
      mars.orientation,
    );
    expect(u0[24]).toBe(Math.fround(expectedCam[0]));
    expect(u0[25]).toBe(Math.fround(expectedCam[1]));
    expect(u0[26]).toBe(Math.fround(expectedCam[2]));
  });

  it('packs Saturn`s SCENE_RINGS radii as ring ratios and zeros for a ringless body', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy(['saturn', 'mars']);
    const view = makeNear0View();
    const saturn = bodyAt('saturn', 58232000);
    const mars = bodyAt('mars', 3390000);
    const state = makeState(renderer, [saturn, mars]);

    texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    const ring = SCENE_RINGS.find((r) => r.bodyId === 'saturn')!;
    const [, , saturnU] = renderer.draw.mock.calls[0]!;
    // Ring ratios at floats 20 (inner) and 21 (outer), planet-radius units.
    expect(saturnU[20]).toBeCloseTo(ring.innerRadiusKm / (saturn.radiusM * SCALE_UNITS.M_TO_KM));
    expect(saturnU[21]).toBeCloseTo(ring.outerRadiusKm / (saturn.radiusM * SCALE_UNITS.M_TO_KM));

    const [, , marsU] = renderer.draw.mock.calls[1]!;
    // Ringless body: the "no ring" sentinel (0) at both ratio slots.
    expect(marsU[20]).toBe(0);
    expect(marsU[21]).toBe(0);
  });

  it('is a no-op when the texturedBodyRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null, [bodyAt('mars', 3390000)]);
    expect(() => texturedBodiesLayer.draw(PASS_STUB, view, NEAR_CTX, state)).not.toThrow();
  });
});
