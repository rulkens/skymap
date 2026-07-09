/**
 * debugSpheresLayer — unit tests for the near-field debug-bodies content row.
 *
 * The load-bearing assertion here is the f64 seam: the layer MUST feed
 * `composeBodyMvp` the slab's `Float64Array` view-projection (`view.slab.vp`),
 * NOT the f32-narrowed `view.vp` the other layers consume. Feeding the f32
 * matrix would resolve the near-cancellation (Earth's ~1e-12 Mpc position
 * against the VP translation) after the precision is already gone, silently
 * mis-placing Earth by more than its radius. We pin that by identity: a
 * mocked `composeBodyMvp` whose first argument must `toBe(view.slab.vp)`,
 * where the fixture's `slab.vp` is a recognisable `Float64Array` and `vp` is a
 * deliberately different `Float32Array`.
 */

import { describe, it, expect, vi } from 'vitest';

import { debugSpheresLayer } from '../../../../../src/services/engine/frame/passes/debugSpheresLayer';
import { DEBUG_SPHERE_BODIES } from '../../../../../src/data/bodies/debugSphereBody';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the renderer a recognisable Float32Array per
// body. The real composition math is covered by composeBodyMvp's own tests.
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

// ctx is unread by this layer (it composes from view.slab.vp + the
// RENDER_ORIGIN_MPC constant), so a bare cast satisfies the signature.
const CTX_STUB = {} as ReadyFrameContext;

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeBodyMvp. The f64 array carries recognisable non-zero
 * values; the f32 array is left as a distinct all-zero Float32Array.
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

describe('debugSpheresLayer.enabled', () => {
  it('is false while the renderer handle is null and true once set', () => {
    const stateNull = { gpu: { debugSphereRenderer: null } } as unknown as EngineState;
    const stateSet = {
      gpu: { debugSphereRenderer: { draw: vi.fn() } },
    } as unknown as EngineState;
    expect(debugSpheresLayer.enabled(stateNull, CTX_STUB)).toBe(false);
    expect(debugSpheresLayer.enabled(stateSet, CTX_STUB)).toBe(true);
  });
});

describe('debugSpheresLayer.draw', () => {
  it('composes one MVP per body from the slab f64 vp and forwards them to the renderer', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeNear0View();
    const state = {
      gpu: { debugSphereRenderer: { draw: drawSpy } },
    } as unknown as EngineState;

    debugSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state);

    // One MVP composed per body, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(DEBUG_SPHERE_BODIES.length);
    DEBUG_SPHERE_BODIES.forEach((body, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(body.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(body.radiusMpc);
    });

    // The renderer receives exactly the composed MVP array (one f32 matrix
    // per body), in body order, in a single draw call.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, mvps] = drawSpy.mock.calls[0]! as [
      GPURenderPassEncoder,
      readonly Float32Array[],
    ];
    expect(passArg).toBe(PASS_STUB);
    expect(mvps).toHaveLength(DEBUG_SPHERE_BODIES.length);
    for (const mvp of mvps) {
      expect(mvp).toBeInstanceOf(Float32Array);
      expect(mvp).toHaveLength(16);
    }
  });

  it('is a no-op when state.gpu.debugSphereRenderer is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = { gpu: { debugSphereRenderer: null } } as unknown as EngineState;
    expect(() => debugSpheresLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
