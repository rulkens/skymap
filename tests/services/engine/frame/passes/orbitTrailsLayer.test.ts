/**
 * orbitTrailsLayer — unit tests for the conic orbit-trails content row.
 *
 * Two load-bearing assertions:
 *
 *   1. The f64 seam — every conic's Ginv composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeOrbitConic`).
 *   2. The packed draw — ONE `renderer.draw(pass, staging, count)` paints
 *      every VISIBLE conic, with conic i's trail params packed at instance
 *      stride 34 floats (Ginv at floats base+0..11, colour + eccentricity at
 *      base+12..15, mean anomaly at base+16, apparent-size fade alpha at
 *      base+17, viewportPx at base+18..19, the clip basis Cc/Ac/Bc at
 *      base+20..31, and the visible arc at base+32..33) front-to-back, and
 *      orbits below the cull threshold dropped from the batch entirely.
 *
 * Plus the handle gates: `enabled` is renderer-presence AND the shared
 * foreground distance gate AND the whole-layer sub-pixel bound (per REGION: the
 * largest of that region's orbits at the camera's nearest possible approach to
 * it — the conservative envelope of the per-orbit cull), and `draw` no-ops on a
 * null handle. The conic table is a static module-level seed.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  orbitTrailsLayer,
  orbitReachByRegion,
} from '../../../../../src/services/engine/frame/passes/orbitTrailsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_ORBIT_CONICS } from '../../../../../src/data/bodies/sceneOrbitConics';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { ORBITAL_ELEMENTS } from '../../../../../src/data/bodies/orbitalElements';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { propagateElements } from '../../../../../src/utils/orbit/propagateElements';
import { keplerianEllipse } from '../../../../../src/utils/orbit/keplerianEllipse';
import type { AnchorBody } from '../../../../../src/@types/scene/AnchorBody';
import type { BodyRegion } from '../../../../../src/@types/scene/BodyRegion';
import type { OrbitalElements } from '../../../../../src/@types/scene/OrbitalElements';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock composeOrbitConic so the test can (a) assert which vp it consumed by
// object identity and (b) hand each conic recognisable Float32Arrays. The real
// composition math is covered by composeOrbitConic's own tests. Ginv is a
// 12-float padded mat3; clipBasis is the (Cc, Ac, Bc) triple the ribbon vertex
// stage consumes. Distinct sentinel values so the packing offsets are pinned.
type ConicOut = {
  ginv: Float32Array;
  clipBasis: readonly [Float32Array, Float32Array, Float32Array];
  arc: readonly [number, number];
};
vi.mock('../../../../../src/utils/camera/composeOrbitConic', () => ({
  composeOrbitConic: vi.fn<() => ConicOut>(() => ({
    ginv: new Float32Array(12),
    clipBasis: [
      new Float32Array([301, 302, 303, 0]),
      new Float32Array([401, 402, 403, 0]),
      new Float32Array([501, 502, 503, 0]),
    ],
    arc: [601, 602],
  })),
}));
import { composeOrbitConic } from '../../../../../src/utils/camera/composeOrbitConic';

const composeMock = composeOrbitConic as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-handle and draw cases: draw never reads ctx, and
// enabled's handle check must short-circuit BEFORE the ctx.cam read
// (renderFrame fixtures carry null handles and a bare ctx).
const CTX_STUB = {} as ReadyFrameContext;

// Beyond the handle check, enabled reads ctx.cam.distance (the shared
// foreground gate) and the camera POSITION + projection knobs (the
// whole-layer sub-pixel cull). The fixture camera sits AT the origin —
// inside the system's reach — where the cull always stays enabled, so the
// `distance` argument alone drives the foreground-gate assertions.
function makeCtx(distance: number): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 4,
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

// draw reads ctx.drawCamPos + ctx.fovYRad for the per-orbit apparent-size
// cull/fade, and ctx.simDays to re-derive each conic. Evaluate at CONST_J2000 so
// the propagated elements equal their tabulated values and the derived conics
// reproduce SCENE_ORBIT_CONICS (the zero-change point). Park the camera a hair
// off the Sun (render origin): the heliocentric planet orbits then project large
// (uncalled) while the tiny geocentric moon orbits — centred at their distant
// planets — stay sub-pixel and cull. No single pose can show every orbit
// (planets and their moons want opposite zooms), so the test asserts the seam
// for ALL composed conics and the layout for the first (Mercury,
// SCENE_ORBIT_CONICS[0], always visible here).
function makeDrawCtx(): ReadyFrameContext {
  return {
    drawCamPos: [1e-13, 0, 0],
    fovYRad: Math.PI / 4,
    cam: { distance: 1e-13 },
    simDays: CONST_J2000,
    focusBlend: 0,
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeOrbitConic.
 */
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
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

function makeRendererSpy() {
  return {
    draw: vi.fn<
      (
        pass: GPURenderPassEncoder,
        instances: Float32Array,
        count: number,
        showImpostor?: boolean,
      ) => void
    >(),
  };
}

// The layer reads settings.orbitTrails.enabled + the fade controller's opacity
// (the hide/show visibility layer) and the clip-opacity channel. Defaults: the
// toggle on and both fade factors at 1, so the pass behaves exactly as before the
// layer became hideable. `orbitTrailsEnabled` / `layerOpacity` drive the gating +
// fade-multiply assertions.
function makeState(
  orbitTrailRenderer: unknown,
  opts: {
    orbitTrailsEnabled?: boolean;
    layerOpacity?: number;
    impostorOn?: boolean;
  } = {},
): EngineState {
  const layerOpacity = opts.layerOpacity ?? 1;
  return {
    gpu: { orbitTrailRenderer },
    settings: {
      orbitTrails: { enabled: opts.orbitTrailsEnabled ?? true },
      debug: {
        overlays: { 'orbit-trail-impostor': opts.impostorOn ?? false },
      },
    },
    subsystems: {
      fades: { opacityOf: () => layerOpacity },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('orbitTrailsLayer registry row', () => {
  it('declares the (hdr, NEAR0, additive) row shape', () => {
    expect(orbitTrailsLayer.name).toBe('orbit-trails');
    expect(orbitTrailsLayer.slab).toBe(NEAR0);
    expect(orbitTrailsLayer.target).toBe('hdr');
    expect(orbitTrailsLayer.blend).toBe('additive');
  });
});

describe('orbitTrailsLayer.enabled', () => {
  it('gates on the renderer handle + the foreground distance — conics are static seeds', () => {
    const state = makeState(makeRendererSpy());
    // Null handle (pre-bootstrap): the handle check short-circuits before the
    // ctx.cam read, so a bare ctx is safe.
    expect(orbitTrailsLayer.enabled(makeState(null), CTX_STUB)).toBe(false);
    // Handle present, camera inside the shared foreground gate.
    expect(orbitTrailsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2))).toBe(true);
    // Beyond the gate the AU-to-lunar-scale trails are deep sub-pixel: off, so
    // the (hdr, NEAR0) step can be skipped wholesale at galaxy zoom. Gate edge +
    // a decade beyond, both derived so a farther seed growing the gate carries.
    expect(orbitTrailsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(orbitTrailsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10))).toBe(false);
  });

  it('gates on the orbitTrails visibility intent (opacity-0 ⇒ no render)', () => {
    // Camera at the origin, inside the foreground gate — the sub-pixel cull is
    // skipped, so the intent gate alone drives the result here.
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const renderer = makeRendererSpy();
    // Toggled off AND the fade fully receded → the whole (hdr, NEAR0) pass drops.
    expect(
      orbitTrailsLayer.enabled(
        makeState(renderer, { orbitTrailsEnabled: false, layerOpacity: 0 }),
        ctx,
      ),
    ).toBe(false);
    // Toggled off but a fade-out tail is still > 0 → keep drawing until it hits 0.
    expect(
      orbitTrailsLayer.enabled(
        makeState(renderer, { orbitTrailsEnabled: false, layerOpacity: 0.3 }),
        ctx,
      ),
    ).toBe(true);
    // Toggled on → visible regardless of the (idle) fade value.
    expect(
      orbitTrailsLayer.enabled(
        makeState(renderer, { orbitTrailsEnabled: true, layerOpacity: 0 }),
        ctx,
      ),
    ).toBe(true);
  });

  it('disables when even the largest orbit is sub-CULL_PX (whole-layer cull)', () => {
    // Camera 1e-6 Mpc from the origin — inside the shared foreground gate,
    // but the whole system's reach (Neptune's orbit, ~1.5e-9 Mpc) subtends
    // only ~2.5 px there, under the 10-px CULL_PX floor. The per-orbit loop
    // would cull every conic, so `enabled` must drop the layer from the
    // pass plan instead of packing zero records.
    const state = makeState(makeRendererSpy());
    const ctx = {
      cam: { distance: 1e-6 },
      drawCamPos: [1e-6, 0, 0],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: Math.PI / 4,
    } as unknown as ReadyFrameContext;
    expect(orbitTrailsLayer.enabled(state, ctx)).toBe(false);
  });

  it('the whole-layer cull still drops solar-system trails at galactic distance', () => {
    // 8.178e-3 Mpc from the Sun — the Galactic Centre's own distance, and the pose
    // a Sgr A* visit parks at. Well inside the shared foreground gate, so only the
    // region cull can drop the layer; the AU-to-lunar trails are ~1e-5 px there.
    const state = makeState(makeRendererSpy());
    const ctx = {
      cam: { distance: 8.178e-3 },
      drawCamPos: [8.178e-3, 0, 0],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: Math.PI / 4,
      simDays: CONST_J2000,
    } as unknown as ReadyFrameContext;
    expect(ctx.cam.distance).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    expect(orbitTrailsLayer.enabled(state, ctx)).toBe(false);
  });
});

// Synthetic two-anchor scene: the Sun at the render origin and a Sgr A*-like
// anchor 8.178e-3 Mpc away, one orbit hanging off each. Synthetic rather than
// the real roster because `orbitReachByRegion` takes its tables as parameters
// precisely so the far-anchored case is pinned by hand-computed apoapses, not by
// whatever the seeded S-star table currently holds.
const SYNTHETIC_ANCHORS: readonly AnchorBody[] = [
  { id: 'sun', positionMpc: [0, 0, 0] },
  { id: 'sgr-a-star', positionMpc: [8.178e-3, 0, 0] },
];

function makeElements(id: string, focusId: string, semiMajorMpc: number): OrbitalElements {
  return {
    id,
    focusId,
    semiMajorMpc,
    eccentricity: 0.5,
    inclinationRad: 0,
    ascendingNodeRad: 0,
    argPeriapsisRad: 0,
    meanAnomalyRad: 0,
    color: [1, 1, 1],
  };
}

function makeRegion(id: BodyRegion['id'], anchorId: string, memberIds: string[]): BodyRegion {
  return { id, label: id, anchorId, memberIds, extentMpc: 0 };
}

describe('orbitReachByRegion', () => {
  it('a Galactic Centre orbit does not inflate the solar-system trail reach', () => {
    const nearOrbit = makeElements('neptune', 'sun', 1e-10);
    const farOrbit = makeElements('s2', 'sgr-a-star', 3e-9);
    const solarSystem = makeRegion('solar-system', 'sun', ['sun', 'neptune']);
    const galacticCentre = makeRegion('galactic-centre', 'sgr-a-star', ['sgr-a-star', 's2']);
    const regionOf = (bodyId: string): BodyRegion | null =>
      [solarSystem, galacticCentre].find((region) => region.memberIds.includes(bodyId)) ?? null;

    const reach = orbitReachByRegion(SYNTHETIC_ANCHORS, [nearOrbit, farOrbit], regionOf);

    // The solar system's reach is its OWN orbits' apoapsis, untouched by the far
    // region's twenty-times-larger one: a single scene-wide maximum would hand it
    // 4.5e-9 and collapse `enabled`'s cull for every camera near the Sun.
    expect(reach.get(solarSystem)).toBeCloseTo(1.5e-10, 20);
    // And the far region's reach is measured from ITS anchor — an apoapsis, not
    // the 8.178e-3 Mpc that anchor sits at from the render origin.
    expect(reach.get(galacticCentre)).toBeCloseTo(4.5e-9, 20);
  });
});

describe('orbitTrailsLayer.draw', () => {
  it('composes each visible conic from view.slab.vp and issues ONE packed draw', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitTrailsLayer.draw(PASS_STUB, view, makeDrawCtx(), makeState(renderer));

    const n = composeMock.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    // The load-bearing seam: EVERY composed Ginv comes from the slab's
    // Float64Array vp — NOT the f32-narrowed view.vp.
    for (const call of composeMock.mock.calls) {
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
    }
    // Conics compose in table order skipping culled ones, so call 0 is the
    // first conic (Mercury), which is visible from the Sun — check its wiring.
    // The conic vectors are re-derived per frame (fresh arrays), so compare by
    // VALUE; at CONST_J2000 they reproduce the static SCENE_ORBIT_CONICS[0].
    // viewportPx and the render origin still pass through by reference.
    const first = SCENE_ORBIT_CONICS[0]!;
    const call0 = composeMock.mock.calls[0]!;
    const center0 = call0[1] as unknown as Vec3;
    const semiMajor0 = call0[2] as unknown as Vec3;
    const semiMinor0 = call0[3] as unknown as Vec3;
    expect(center0[0]).toBeCloseTo(first.centerMpc[0], 20);
    expect(center0[1]).toBeCloseTo(first.centerMpc[1], 20);
    expect(center0[2]).toBeCloseTo(first.centerMpc[2], 20);
    expect(semiMajor0[0]).toBeCloseTo(first.semiMajorMpc[0], 20);
    expect(semiMajor0[1]).toBeCloseTo(first.semiMajorMpc[1], 20);
    expect(semiMajor0[2]).toBeCloseTo(first.semiMajorMpc[2], 20);
    expect(semiMinor0[0]).toBeCloseTo(first.semiMinorMpc[0], 20);
    expect(semiMinor0[1]).toBeCloseTo(first.semiMinorMpc[1], 20);
    expect(semiMinor0[2]).toBeCloseTo(first.semiMinorMpc[2], 20);
    expect(call0[4]).toBe(view.viewportPx);
    expect(call0[5]).toBe(RENDER_ORIGIN_MPC);

    // Exactly one draw for the whole batch, one packed record per composed
    // conic — count == number composed.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(n);
    expect(staging).toBeInstanceOf(Float32Array);

    // Staging layout for the first conic (instance 0, stride 34): colour +
    // eccentricity at floats 12..15, mean anomaly at 16, fade alpha at 17
    // (saturated — Mercury's orbit is large from the Sun), then the viewport
    // (was a zeroed pad; now the ribbon vertex stage's divisor), then the
    // clip basis at 20..31 and the visible arc at 32..33.
    expect(staging[12]).toBeCloseTo(first.color[0]);
    expect(staging[13]).toBeCloseTo(first.color[1]);
    expect(staging[14]).toBeCloseTo(first.color[2]);
    expect(staging[15]).toBeCloseTo(first.eccentricity);
    expect(staging[16]).toBeCloseTo(first.meanAnomalyRad);
    expect(staging[17]).toBe(1);
    expect(staging[18]).toBe(view.viewportPx[0]);
    expect(staging[19]).toBe(view.viewportPx[1]);
  });

  it('the clip basis and viewport reach the packed record', () => {
    // Task 6's other new floats: 20..31 (Cc/Ac/Bc, the ribbon vertex stage's
    // screen-space bound) and 18..19 (viewportPx, its divisor — a landmine if
    // left zeroed: the ribbon vertex shader divides by it, so a stray zero
    // turns every ribbon vertex NaN with no visible error anywhere).
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitTrailsLayer.draw(PASS_STUB, view, makeDrawCtx(), makeState(renderer));

    const [, staging] = renderer.draw.mock.calls[0]!;
    expect(staging[18]).toBe(view.viewportPx[0]);
    expect(staging[19]).toBe(view.viewportPx[1]);
    // clipBasis = [Cc, Ac, Bc], each a length-4 padded sentinel from the mock.
    expect(Array.from(staging.slice(20, 24))).toEqual([301, 302, 303, 0]);
    expect(Array.from(staging.slice(24, 28))).toEqual([401, 402, 403, 0]);
    expect(Array.from(staging.slice(28, 32))).toEqual([501, 502, 503, 0]);
    expect(staging[32]).toBe(601);
    expect(staging[33]).toBe(602);
  });

  it('multiplies the whole-layer fade opacity into each per-orbit alpha', () => {
    // A mid-fade hide (layer opacity 0.5) scales every packed per-orbit alpha:
    // Mercury's apparent-size alpha saturates at 1 from the Sun, so its packed
    // alpha must land at exactly 0.5 — the hide/show fade composed with the
    // apparent-size fade rather than replacing it.
    const renderer = makeRendererSpy();
    orbitTrailsLayer.draw(
      PASS_STUB,
      makeNear0View(),
      makeDrawCtx(),
      makeState(renderer, { orbitTrailsEnabled: false, layerOpacity: 0.5 }),
    );
    const [, staging] = renderer.draw.mock.calls[0]!;
    expect(staging[17]).toBeCloseTo(0.5);
  });

  it('rides a moon trail centre on its propagated parent, not the J2000 centre', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    // An instant ~100 days on: Earth has swung ~98° along its orbit, far from
    // its J2000 spot. The Moon's geocentric trail must ride that moved Earth.
    const simDays = CONST_J2000 + 100;
    const snapshot = deriveBodyStates(simDays);
    const earthPos = snapshot.get('earth')!.positionMpc;

    // Park the camera AT Earth so the tiny geocentric Moon orbit projects large
    // and survives the apparent-size cull. Heliocentric planet orbits (centred
    // at the far-off Sun) also compose; the Moon is singled out below by being
    // the one conic whose centre rides ~1 AU out on Earth.
    const ctx = {
      drawCamPos: [earthPos[0], earthPos[1], earthPos[2]],
      fovYRad: Math.PI / 4,
      cam: { distance: 1e-13 },
      simDays,
      focusBlend: 0,
      nowMs: 0,
    } as unknown as ReadyFrameContext;

    orbitTrailsLayer.draw(PASS_STUB, view, ctx, makeState(renderer));

    // Expected Moon centre = Earth's SNAPSHOT position + the Moon's focus-relative
    // offset at t. The parent position is READ from the snapshot (Task 7), NOT
    // re-derived, so this pins the rides-the-snapshot-parent contract rather than
    // re-running the layer's own composition (no mirror). Only the Moon's
    // focus-relative offset — which the snapshot does not carry — comes from
    // keplerianEllipse, hand-composed onto the snapshot parent.
    const moonEl = ORBITAL_ELEMENTS.find((e) => e.id === 'moon')!;
    const moonOffset = keplerianEllipse(propagateElements(moonEl, simDays)).centerOffsetMpc;
    const expected: Vec3 = [
      earthPos[0] + moonOffset[0],
      earthPos[1] + moonOffset[1],
      earthPos[2] + moonOffset[2],
    ];

    // The Moon is the unique composed conic centred ~1 AU from the origin (every
    // heliocentric orbit centres near the Sun), so the compose call whose centre
    // sits nearest Earth is the Moon's — independent of whether the layer placed
    // it correctly.
    let moonCenter: Vec3 | undefined;
    let best = Infinity;
    for (const call of composeMock.mock.calls) {
      const c = call[1] as unknown as Vec3;
      const d = Math.hypot(c[0] - earthPos[0], c[1] - earthPos[1], c[2] - earthPos[2]);
      if (d < best) {
        best = d;
        moonCenter = c;
      }
    }
    expect(moonCenter).toBeDefined();
    const moon = moonCenter!;

    expect(moon[0]).toBeCloseTo(expected[0], 18);
    expect(moon[1]).toBeCloseTo(expected[1], 18);
    expect(moon[2]).toBeCloseTo(expected[2], 18);

    // And it MOVED off the frozen J2000 centre — the whole point of re-deriving
    // at t. Earth swept ~98° in 100 days, so the geocentric centre shifts far
    // more than the lunar a·e.
    const j2000Moon = SCENE_ORBIT_CONICS.find((c) => c.id === 'moon')!;
    const drift = Math.hypot(
      moon[0] - j2000Moon.centerMpc[0],
      moon[1] - j2000Moon.centerMpc[1],
      moon[2] - j2000Moon.centerMpc[2],
    );
    expect(drift).toBeGreaterThan(1e-13);
  });

  it('S-star trails are gated off when the camera is in the solar system', () => {
    // The payoff of the per-region reach. A camera at the Sun draws the planet
    // trails and must pack none of the 39 S-star conics: they sit 8.178e-3 Mpc
    // away and the widest of them subtends ~0.04 px there, deep under CULL_PX.
    // A single scene-wide orbit extent would have handed the whole table the
    // S-stars' envelope and kept them in the batch from every near-Sun pose.
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    orbitTrailsLayer.draw(PASS_STUB, makeNear0View(), makeDrawCtx(), makeState(renderer));

    // Every S-star conic centres within its own a·e of Sgr A* (1.4e-7 Mpc at the
    // widest), so a 1e-4 Mpc window around the anchor catches all 39 and no
    // heliocentric or geocentric orbit — those centre within ~1.5e-9 Mpc of the
    // render origin, four decades of separation away.
    const sgrAPos = deriveBodyStates(CONST_J2000).get('sgr-a-star')!.positionMpc;
    const galacticCentreConics = composeMock.mock.calls.filter((call) => {
      const c = call[1] as unknown as Vec3;
      return Math.hypot(c[0] - sgrAPos[0], c[1] - sgrAPos[1], c[2] - sgrAPos[2]) < 1e-4;
    });

    expect(composeMock.mock.calls.length).toBeGreaterThan(0);
    expect(galacticCentreConics).toHaveLength(0);
  });

  it('is a no-op when the orbitTrailRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    expect(() => orbitTrailsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(null))).not.toThrow();
  });

  it('culls every orbit and skips the draw when all are deep sub-pixel', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    // Camera 1 Mpc from the Sun — the AU-to-lunar orbits are far below the
    // apparent-size cull threshold, so nothing is packed and no draw is issued.
    const farCtx = {
      drawCamPos: [1, 0, 0],
      fovYRad: Math.PI / 4,
      cam: { distance: 1 },
      simDays: CONST_J2000,
      focusBlend: 0,
      nowMs: 0,
    } as unknown as ReadyFrameContext;
    orbitTrailsLayer.draw(PASS_STUB, makeNear0View(), farCtx, makeState(renderer));
    expect(renderer.draw).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled(); // culled before composing Ginv
  });

  it('an eSpan <= 0 arc (whole orbit behind the camera) drops that one instance from the packed count', () => {
    // The mock normally hands back a constant [601, 602] arc, so this pins
    // the layer's OWN `if (arc[1] <= 0) continue`, not composeOrbitConic's
    // real math (covered separately).
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    composeMock.mockClear();
    renderer.draw.mockClear();

    orbitTrailsLayer.draw(PASS_STUB, view, makeDrawCtx(), makeState(renderer));
    const baselineCount = renderer.draw.mock.calls[0]![2] as number;
    expect(baselineCount).toBeGreaterThan(1); // need a second composed orbit to single out below

    const defaultImpl = composeMock.getMockImplementation() as unknown as (
      ...args: unknown[]
    ) => ConicOut;
    let call = 0;
    composeMock.mockImplementation((...args: unknown[]) => {
      call++;
      const out = defaultImpl(...args);
      return call === 2 ? { ...out, arc: [0, 0] } : out;
    });
    renderer.draw.mockClear();

    orbitTrailsLayer.draw(PASS_STUB, view, makeDrawCtx(), makeState(renderer));
    expect(renderer.draw.mock.calls[0]![2]).toBe(baselineCount - 1);

    composeMock.mockImplementation(defaultImpl); // restore the default for later tests
  });

  it('the layer forwards the debug flag to the renderer', () => {
    // `enabled()` never forces the layer on for this flag — draw() just reads
    // it alongside settings.orbitTrails.enabled and passes it straight through
    // as renderer.draw's fourth argument.
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitTrailsLayer.draw(
      PASS_STUB,
      view,
      makeDrawCtx(),
      makeState(renderer, { impostorOn: true }),
    );
    expect(renderer.draw.mock.calls[0]![3]).toBe(true);

    renderer.draw.mockClear();
    orbitTrailsLayer.draw(
      PASS_STUB,
      view,
      makeDrawCtx(),
      makeState(renderer, { impostorOn: false }),
    );
    expect(renderer.draw.mock.calls[0]![3]).toBe(false);
  });
});
