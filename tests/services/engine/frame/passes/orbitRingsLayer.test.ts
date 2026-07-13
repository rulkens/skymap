/**
 * orbitRingsLayer — unit tests for the debug orbit-rings content row.
 *
 * Two load-bearing assertions (mirrors `planetsLayer.test.ts`):
 *
 *   1. The f64 seam — every ring's MVP composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeOrbitMvp`).
 *   2. The single instanced draw — ONE `renderer.draw(pass, staging, n)`
 *      paints every ring, with orbit i's tint packed at instance stride 20
 *      floats (colour at floats base+16..18).
 *
 * Plus the handle gates: `enabled` is renderer-presence only (the orbit
 * table is a static module-level seed — always three rings), and `draw`
 * no-ops on a null handle.
 */

import { describe, it, expect, vi } from 'vitest';

import { orbitRingsLayer } from '../../../../../src/services/engine/frame/passes/orbitRingsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_ORBITS } from '../../../../../src/data/bodies/sceneOrbits';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/orbitRingRenderer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

// Mock composeOrbitMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand each ring a recognisable Float32Array. The
// real composition math is covered by composeOrbitMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeOrbitMvp', () => ({
  composeOrbitMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeOrbitMvp } from '../../../../../src/utils/camera/composeOrbitMvp';

const composeMock = composeOrbitMvp as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
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
 * layer fed to composeOrbitMvp.
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

function makeState(orbitRingRenderer: unknown): EngineState {
  return { gpu: { orbitRingRenderer } } as unknown as EngineState;
}

describe('orbitRingsLayer registry row', () => {
  it('declares the (hdr, NEAR0, additive) row shape', () => {
    expect(orbitRingsLayer.name).toBe('orbit-rings');
    expect(orbitRingsLayer.slab).toBe(NEAR0);
    expect(orbitRingsLayer.target).toBe('hdr');
    expect(orbitRingsLayer.blend).toBe('additive');
  });
});

describe('orbitRingsLayer.enabled', () => {
  it('gates on the renderer handle + the foreground distance — orbits are static seeds', () => {
    const state = makeState(makeRendererSpy());
    // Null handle (pre-bootstrap). NOTE: deliberately no state.data and a
    // bare ctx — the handle check short-circuits before the ctx.cam read.
    expect(orbitRingsLayer.enabled(makeState(null), CTX_STUB)).toBe(false);
    // Handle present, camera inside the shared foreground gate.
    expect(orbitRingsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2))).toBe(true);
    // Beyond the gate the AU-to-lunar-scale rings are deep sub-pixel: off, so
    // the (hdr, NEAR0) step can be skipped wholesale at galaxy zoom.
    expect(orbitRingsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(orbitRingsLayer.enabled(state, makeCtx(0.43))).toBe(false);
  });
});

describe('orbitRingsLayer.draw', () => {
  it('composes one MVP per orbit from view.slab.vp and issues ONE instanced draw', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();

    orbitRingsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(renderer));

    // One MVP composed per orbit, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(SCENE_ORBITS.length);
    SCENE_ORBITS.forEach((orbit, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(orbit.centerMpc);
      expect(call[2]).toBe(orbit.uAxis);
      expect(call[3]).toBe(orbit.vAxis);
      expect(call[4]).toBe(orbit.radiusMpc);
      expect(call[5]).toBe(RENDER_ORIGIN_MPC);
    });

    // Exactly one draw for the whole batch, with count == orbit count.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(SCENE_ORBITS.length);
    expect(staging).toBeInstanceOf(Float32Array);

    // The staging layout: each orbit's tint sits at floats base+16..18 of
    // its 20-float record.
    SCENE_ORBITS.forEach((orbit, i) => {
      const base = i * INSTANCE_FLOATS;
      expect(base).toBe(i * 20);
      expect(staging[base + 16]).toBeCloseTo(orbit.color[0]);
      expect(staging[base + 17]).toBeCloseTo(orbit.color[1]);
      expect(staging[base + 18]).toBeCloseTo(orbit.color[2]);
      expect(staging[base + 19]).toBe(0); // trailing pad stays zeroed
    });
  });

  it('is a no-op when the orbitRingRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    expect(() => orbitRingsLayer.draw(PASS_STUB, view, CTX_STUB, makeState(null))).not.toThrow();
  });
});
