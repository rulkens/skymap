/**
 * orbitTrailsLayer — unit tests for the conic orbit-trails content row.
 *
 * Two load-bearing assertions:
 *
 *   1. The f64 seam — every conic's Ginv composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeOrbitConic`).
 *   2. The single instanced draw — ONE `renderer.draw(pass, staging, n)`
 *      paints every VISIBLE conic, with conic i's trail params packed at
 *      instance stride 28 floats (Ginv at floats base+0..11, colour +
 *      eccentricity at base+12..15, mean anomaly at base+16, apparent-size fade
 *      alpha at base+17, pad at base+18..19, and the two gradient-minor triples
 *      at base+20..23 / base+24..27), and orbits below the cull threshold
 *      dropped from the batch entirely.
 *
 * Plus the handle gates: `enabled` is renderer-presence AND the shared
 * foreground distance gate AND the whole-layer sub-pixel bound (the largest
 * orbit's apparent size at the camera's nearest possible approach — the
 * conservative envelope of the per-orbit cull), and `draw` no-ops on a null
 * handle. The conic table is a static module-level seed.
 */

import { describe, it, expect, vi } from 'vitest';

import { orbitTrailsLayer } from '../../../../../src/services/engine/frame/passes/orbitTrailsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_ORBIT_CONICS } from '../../../../../src/data/bodies/sceneOrbitConics';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

// Mock composeOrbitConic so the test can (a) assert which vp it consumed by
// object identity and (b) hand each conic recognisable Float32Arrays. The real
// composition math is covered by composeOrbitConic's own tests. Ginv is a
// 12-float padded mat3; minorS/minorT are 4-float padded triples (the gradient-
// minor hoist). Distinct sentinel values so the packing offsets are pinned.
type ConicOut = { ginv: Float32Array; minorS: Float32Array; minorT: Float32Array };
vi.mock('../../../../../src/utils/camera/composeOrbitConic', () => ({
  composeOrbitConic: vi.fn<() => ConicOut>(() => ({
    ginv: new Float32Array(12),
    minorS: new Float32Array([101, 102, 103, 0]),
    minorT: new Float32Array([201, 202, 203, 0]),
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
  } as unknown as ReadyFrameContext;
}

// draw reads ctx.drawCamPos + ctx.fovYRad for the per-orbit apparent-size
// cull/fade. Park the camera a hair off the Sun (render origin): the
// heliocentric planet orbits then project large (uncalled) while the tiny
// geocentric moon orbits — centred at their distant planets — stay sub-pixel
// and cull. No single pose can show every orbit (planets and their moons want
// opposite zooms), so the test asserts the seam for ALL composed conics and the
// layout for the first (Mercury, SCENE_ORBIT_CONICS[0], always visible here).
function makeDrawCtx(): ReadyFrameContext {
  return {
    drawCamPos: [1e-13, 0, 0],
    fovYRad: Math.PI / 4,
    cam: { distance: 1e-13 },
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
    draw: vi.fn<(pass: GPURenderPassEncoder, instances: Float32Array, count: number) => void>(),
  };
}

function makeState(orbitTrailRenderer: unknown): EngineState {
  return { gpu: { orbitTrailRenderer } } as unknown as EngineState;
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
});

describe('orbitTrailsLayer.draw', () => {
  it('composes each visible conic from view.slab.vp and issues ONE instanced draw', () => {
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
    const first = SCENE_ORBIT_CONICS[0]!;
    const call0 = composeMock.mock.calls[0]!;
    expect(call0[1]).toBe(first.centerMpc);
    expect(call0[2]).toBe(first.semiMajorMpc);
    expect(call0[3]).toBe(first.semiMinorMpc);
    expect(call0[4]).toBe(view.viewportPx);
    expect(call0[5]).toBe(RENDER_ORIGIN_MPC);

    // Exactly one draw for the whole batch, count == number composed.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(n);
    expect(staging).toBeInstanceOf(Float32Array);

    // Staging layout for the first conic (instance 0, stride 28): colour +
    // eccentricity at floats 12..15, mean anomaly at 16, fade alpha at 17
    // (saturated — Mercury's orbit is large from the Sun), pad at 18..19, then
    // the two gradient-minor triples at 20..23 and 24..27 (the CPU-f64 hoist).
    expect(staging[12]).toBeCloseTo(first.color[0]);
    expect(staging[13]).toBeCloseTo(first.color[1]);
    expect(staging[14]).toBeCloseTo(first.color[2]);
    expect(staging[15]).toBeCloseTo(first.eccentricity);
    expect(staging[16]).toBeCloseTo(first.meanAnomalyRad);
    expect(staging[17]).toBe(1);
    expect(staging[18]).toBe(0);
    expect(staging[19]).toBe(0);
    // minorS (M1/M2/M3 + pad) → floats 20..23, minorT (M4/M5/M6 + pad) → 24..27.
    expect(Array.from(staging.slice(20, 24))).toEqual([101, 102, 103, 0]);
    expect(Array.from(staging.slice(24, 28))).toEqual([201, 202, 203, 0]);
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
    } as unknown as ReadyFrameContext;
    orbitTrailsLayer.draw(PASS_STUB, makeNear0View(), farCtx, makeState(renderer));
    expect(renderer.draw).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled(); // culled before composing Ginv
  });
});
