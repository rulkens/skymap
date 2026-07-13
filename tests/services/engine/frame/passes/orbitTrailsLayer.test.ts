/**
 * orbitTrailsLayer — unit tests for the conic orbit-trails content row.
 *
 * Two load-bearing assertions:
 *
 *   1. The f64 seam — every conic's Ginv composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeOrbitConic`).
 *   2. The single instanced draw — ONE `renderer.draw(pass, staging, n)`
 *      paints every VISIBLE conic, with each conic's trail params packed at
 *      instance stride 20 floats (Ginv at floats base+0..11, colour +
 *      eccentricity at base+12..15, mean anomaly at base+16, per-orbit fade at
 *      base+17, pad at base+18..19). A per-orbit `orbitTrailFade` (mocked here)
 *      culls orbits the camera is inside / that are sub-pixel, packing the
 *      survivors CONTIGUOUSLY from base 0 via a running write index.
 *
 * Plus the handle gates: `enabled` is renderer-presence AND the shared
 * foreground distance gate (the conic table is a static module-level seed —
 * derived once from the elements), and `draw` no-ops on a null handle.
 */

import { describe, it, expect, vi } from 'vitest';

import { orbitTrailsLayer } from '../../../../../src/services/engine/frame/passes/orbitTrailsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_ORBIT_CONICS } from '../../../../../src/data/bodies/sceneOrbitConics';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/orbitTrailRenderer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

// Mock composeOrbitConic so the test can (a) assert which vp it consumed by
// object identity and (b) hand each conic a recognisable Float32Array. The
// real composition math is covered by composeOrbitConic's own tests. Ginv is a
// 12-float padded mat3.
vi.mock('../../../../../src/utils/camera/composeOrbitConic', () => ({
  composeOrbitConic: vi.fn<() => Float32Array>(() => new Float32Array(12)),
}));
import { composeOrbitConic } from '../../../../../src/utils/camera/composeOrbitConic';

const composeMock = composeOrbitConic as unknown as ReturnType<typeof vi.fn>;

// Mock orbitTrailFade too, so this test isolates PACKING + the f64 seam from
// the fade math (owned by orbitTrailFade's own test). Without it, the mock
// geometry (camPos ~5 Mpc from the ~1e-12 Mpc orbits) would make the REAL fade
// cull everything. Default return 1 = fully visible; individual tests drive it.
vi.mock('../../../../../src/utils/camera/orbitTrailFade', () => ({
  orbitTrailFade: vi.fn<() => number>(() => 1),
}));
import { orbitTrailFade } from '../../../../../src/utils/camera/orbitTrailFade';

const fadeMock = orbitTrailFade as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-handle and draw cases: draw never reads ctx, and
// enabled's handle check must short-circuit BEFORE the ctx.cam read
// (renderFrame fixtures carry null handles and a bare ctx).
const CTX_STUB = {} as ReadyFrameContext;

// enabled reads only ctx.cam.distance beyond the handle check.
function makeCtx(distance: number): ReadyFrameContext {
  return { cam: { distance } } as unknown as ReadyFrameContext;
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
    // the (hdr, NEAR0) step can be skipped wholesale at galaxy zoom.
    expect(orbitTrailsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(orbitTrailsLayer.enabled(state, makeCtx(0.43))).toBe(false);
  });
});

describe('orbitTrailsLayer.draw', () => {
  it('composes one Ginv per conic from view.slab.vp and issues ONE instanced draw', () => {
    composeMock.mockClear();
    fadeMock.mockClear();
    fadeMock.mockReturnValue(1); // every conic visible → count == length
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitTrailsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(renderer));

    // One Ginv composed per conic, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(SCENE_ORBIT_CONICS.length);
    SCENE_ORBIT_CONICS.forEach((conic, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(conic.centerMpc);
      expect(call[2]).toBe(conic.semiMajorMpc);
      expect(call[3]).toBe(conic.semiMinorMpc);
      expect(call[4]).toBe(view.viewportPx);
      expect(call[5]).toBe(RENDER_ORIGIN_MPC);
    });

    // Exactly one draw for the whole batch, with count == conic count.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(SCENE_ORBIT_CONICS.length);
    expect(staging).toBeInstanceOf(Float32Array);

    // The staging layout: each conic's colour + eccentricity sit at floats
    // base+12..15, the mean anomaly at base+16, the per-orbit fade at base+17,
    // the trailing pad at base+18..19.
    SCENE_ORBIT_CONICS.forEach((conic, i) => {
      const base = i * INSTANCE_FLOATS;
      expect(base).toBe(i * 20);
      expect(staging[base + 12]).toBeCloseTo(conic.color[0]);
      expect(staging[base + 13]).toBeCloseTo(conic.color[1]);
      expect(staging[base + 14]).toBeCloseTo(conic.color[2]);
      expect(staging[base + 15]).toBeCloseTo(conic.eccentricity);
      expect(staging[base + 16]).toBeCloseTo(conic.meanAnomalyRad);
      expect(staging[base + 17]).toBe(1); // the per-orbit fade (mocked to 1 here)
      expect(staging[base + 18]).toBe(0); // trailing pad stays zeroed
      expect(staging[base + 19]).toBe(0);
    });
  });

  it('skips orbits whose fade is below the floor (camera inside / sub-pixel)', () => {
    // The wedge-bug guard at the layer level: an orbit the camera is inside of
    // (fade 0) must never be composed or packed, and the survivors must pack
    // contiguously from base 0 — a naive `i * INSTANCE_FLOATS` write index would
    // leave a hole where the culled conic was.
    expect(SCENE_ORBIT_CONICS.length).toBeGreaterThanOrEqual(2);
    composeMock.mockClear();
    fadeMock.mockReset();
    fadeMock.mockReturnValueOnce(0).mockReturnValue(1); // conic 0 culled, rest visible
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitTrailsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(renderer));

    const survivors = SCENE_ORBIT_CONICS.length - 1;

    // Only the survivors are composed, and the culled conic never is.
    expect(composeMock).toHaveBeenCalledTimes(survivors);
    const composedCentres = composeMock.mock.calls.map((call) => call[1]);
    expect(composedCentres).not.toContain(SCENE_ORBIT_CONICS[0]!.centerMpc);

    // One draw for the survivors, count reflecting only the visible orbits.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [, staging, count] = renderer.draw.mock.calls[0]!;
    expect(count).toBe(survivors);

    // Running write index: the FIRST survivor (SCENE_ORBIT_CONICS[1]) lands at
    // base 0, not at its source index 1 — the property a naive index breaks.
    const survivor = SCENE_ORBIT_CONICS[1]!;
    expect(staging[12]).toBeCloseTo(survivor.color[0]);
    expect(staging[13]).toBeCloseTo(survivor.color[1]);
    expect(staging[14]).toBeCloseTo(survivor.color[2]);
    expect(staging[15]).toBeCloseTo(survivor.eccentricity);
    expect(staging[17]).toBe(1); // survivor's fade
  });

  it('is a no-op when the orbitTrailRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    expect(() => orbitTrailsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(null))).not.toThrow();
  });
});
