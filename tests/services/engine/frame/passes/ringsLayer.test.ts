/**
 * ringsLayer — unit tests for the translucent planetary-ring row.
 *
 * Load-bearing assertions:
 *
 *   1. The row profile: (foreground:0, NEAR0), blend 'over' — the one
 *      translucent member of the opaque foreground group.
 *   2. The gate: a ring draws only when its radial strip is resident AND its
 *      host body resolves; a null renderer, a non-resident strip, or the
 *      distance gate each disable the row.
 *   3. The f64 seam: the ring MVP composes from the slab's `Float64Array`
 *      view-projection (`view.slab.vp`), NOT the f32-narrowed `view.vp`, scaled
 *      to the ring's OUTER radius with the host body's orientation.
 *   4. The packed uniform: `packRingUniforms` carries the host sun direction,
 *      `planetRadiusRatio` (planet / outer) and `innerRatio` (inner / outer) in
 *      their byte slots.
 */

import { describe, it, expect, vi } from 'vitest';

import { ringsLayer } from '../../../../../src/services/engine/frame/passes/ringsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../../src/data/bodies/sceneRings';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../../src/utils/camera/camPosLocal';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

// Mock composeBodyMvp so the test can assert which vp it consumed by identity.
// Real composeBodyMvp returns f64; the layer narrows its own copy at the
// GPU-upload boundary. The composition math is covered by composeBodyMvp's
// own tests.
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

const SATURN_RING = SCENE_RINGS.find((r) => r.textureId === 'saturn-ring')!;

/** Saturn sitting down +x, firmly resolved on the 720-tall/60° fixture. */
function saturnBody(orientation: Mat3 = IDENTITY_MAT3): SeededPlanet {
  const radiusKm = 58232;
  const distanceKm = radiusKm * 5;
  return {
    id: SATURN_RING.bodyId,
    label: 'Saturn',
    positionMpc: [distanceKm * SCALE_UNITS.KM_TO_MPC, 0, 0],
    radiusKm,
    albedo: [0.8, 0.7, 0.5],
    orientation,
  };
}

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
    reversedZ: false,
  };
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

/**
 * State with a `ringRenderer` handle, a seeded body list, and a `bodyTextures`
 * slot Map reporting the given ids resident (`current()` non-null).
 */
function makeState(
  renderer: unknown,
  bodies: readonly PlanetBody[],
  residentIds: readonly string[],
): EngineState {
  // The residency lookup keys on the composite `${id}:surface` slot key.
  const bodyTextures = new Map(
    residentIds.map((id) => [`${id}:surface`, { current: () => ({}) as ImageBitmap }]),
  );
  return {
    gpu: { ringRenderer: renderer },
    data: { bodies: { planets: bodies } },
    assetSlots: { bodyTextures },
  } as unknown as EngineState;
}

function makeRendererSpy() {
  return { draw: vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array) => void>() };
}

describe('ringsLayer row profile', () => {
  it('is (foreground:0, NEAR0) with straight-alpha over', () => {
    expect(ringsLayer.name).toBe('rings');
    expect(ringsLayer.slab).toBe(NEAR0);
    expect(ringsLayer.target).toBe('foreground:0');
    expect(ringsLayer.blend).toBe('over');
  });
});

describe('ringsLayer.enabled', () => {
  it('is false while the ringRenderer handle is null (bare ctx short-circuits)', () => {
    expect(ringsLayer.enabled(makeState(null, [], []), CTX_STUB)).toBe(false);
  });

  it('is false beyond the foreground gate even with a resident resolved ring', () => {
    const state = makeState(makeRendererSpy(), [saturnBody()], ['saturn-ring']);
    expect(ringsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
  });

  it('is false when the ring strip is NOT resident', () => {
    // Host body present + resolved, but the radial strip has not committed.
    const state = makeState(makeRendererSpy(), [saturnBody()], []);
    expect(ringsLayer.enabled(state, NEAR_CTX)).toBe(false);
  });

  it('is true when the strip is resident and the host body resolves', () => {
    const state = makeState(makeRendererSpy(), [saturnBody()], ['saturn-ring']);
    expect(ringsLayer.enabled(state, NEAR_CTX)).toBe(true);
  });
});

describe('ringsLayer.draw', () => {
  it('composes from the slab f64 vp scaled to the ring OUTER radius, with the host orientation', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const saturnOrient: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const saturn = saturnBody(saturnOrient);
    const state = makeState(renderer, [saturn], ['saturn-ring']);

    ringsLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    expect(call[1]).toBe(saturn.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    // Scaled to the ring's OUTER radius (not the planet radius).
    expect(call[3]).toBeCloseTo(SATURN_RING.outerRadiusKm * SCALE_UNITS.KM_TO_MPC);
    expect(call[4]).toBe(saturn.orientation);
  });

  it('packs the host sun, planetRadiusRatio@19, camPosLocal@20 and innerRatio@23 into a 24-float record', () => {
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const saturn = saturnBody();
    const state = makeState(renderer, [saturn], ['saturn-ring']);

    ringsLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [pass, u] = renderer.draw.mock.calls[0]!;
    expect(pass).toBe(PASS_STUB);
    expect(u).toBeInstanceOf(Float32Array);
    expect(u).toHaveLength(24);

    // sunDirLocal at floats 16..18 (recomputed independently, so a rotate/pack
    // drift lands here).
    const expectedSun = sunDirLocal(saturn.positionMpc, RENDER_ORIGIN_MPC, saturn.orientation);
    expect(u[16]).toBeCloseTo(expectedSun[0]);
    expect(u[17]).toBeCloseTo(expectedSun[1]);
    expect(u[18]).toBeCloseTo(expectedSun[2]);
    // planetRadiusRatio = planet / ring outer at float 19.
    expect(u[19]).toBeCloseTo(saturn.radiusKm / SATURN_RING.outerRadiusKm);
    // camPosLocal at floats 20..22 (recomputed independently — a rotate/pack
    // drift lands here, as with the sun above).
    const radiusMpc = saturn.radiusKm * SCALE_UNITS.KM_TO_MPC;
    const expectedCam = camPosLocal(
      NEAR_CTX.drawCamPos,
      saturn.positionMpc,
      radiusMpc,
      saturn.orientation,
    );
    expect(u[20]).toBeCloseTo(expectedCam[0]);
    expect(u[21]).toBeCloseTo(expectedCam[1]);
    expect(u[22]).toBeCloseTo(expectedCam[2]);
    // innerRatio = ring inner / outer at float 23 (fills camPosLocal's vec3 tail).
    expect(u[23]).toBeCloseTo(SATURN_RING.innerRadiusKm / SATURN_RING.outerRadiusKm);
  });

  it('is a no-op when the ringRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null, [saturnBody()], ['saturn-ring']);
    expect(() => ringsLayer.draw(PASS_STUB, view, NEAR_CTX, state)).not.toThrow();
  });
});
