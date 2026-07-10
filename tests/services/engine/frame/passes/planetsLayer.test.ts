/**
 * planetsLayer — unit tests for the seeded-planets content row.
 *
 * Two load-bearing assertions:
 *
 *   1. The f64 seam — every planet's MVP composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeBodyMvp`).
 *   2. The per-instance dispatch — planet i draws through ITS OWN renderer
 *      instance (`planetRenderers[i]`), never a shared one, because each
 *      instance owns a single non-dynamic uniform buffer and two same-frame
 *      draws through one instance would race `queue.writeBuffer` against
 *      the pending submit (both planets would render at the last-written
 *      MVP).
 */

import { describe, it, expect, vi } from 'vitest';

import { planetsLayer } from '../../../../../src/services/engine/frame/passes/planetsLayer';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/sceneBodies';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand each renderer a recognisable Float32Array.
// The real composition math is covered by composeBodyMvp's own tests.
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
 * layer fed to composeBodyMvp.
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

/** State with a `planetRenderers` handle set and a seeded planet list. */
function makeState(planetRenderers: unknown, planets: readonly PlanetBody[]): EngineState {
  return {
    gpu: { planetRenderers },
    data: { bodies: { planets } },
  } as unknown as EngineState;
}

function makeRendererSpies() {
  return SCENE_PLANETS.map(() => ({
    draw: vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array, albedo: Vec3) => void>(),
  }));
}

describe('planetsLayer.enabled', () => {
  it('is false while planetRenderers is null / empty and while no planets are seeded; true with both', () => {
    // Null handle. NOTE: deliberately no state.data — the handle check must
    // short-circuit BEFORE the bodies read (renderFrame fixtures carry no
    // bodies bag).
    expect(
      planetsLayer.enabled({ gpu: { planetRenderers: null } } as unknown as EngineState, CTX_STUB),
    ).toBe(false);
    // Renderers only, nothing seeded.
    expect(planetsLayer.enabled(makeState(makeRendererSpies(), []), CTX_STUB)).toBe(false);
    // Seeded planets but an empty renderer set.
    expect(planetsLayer.enabled(makeState([], SCENE_PLANETS), CTX_STUB)).toBe(false);
    // Both present.
    expect(planetsLayer.enabled(makeState(makeRendererSpies(), SCENE_PLANETS), CTX_STUB)).toBe(
      true,
    );
  });
});

describe('planetsLayer.draw', () => {
  it('Moon and Jupiter each get a composeBodyMvp call from view.slab.vp and a draw through their own renderer instance', () => {
    composeMock.mockClear();
    const renderers = makeRendererSpies();
    const view = makeNear0View();
    const state = makeState(renderers, SCENE_PLANETS);

    planetsLayer.draw(PASS_STUB, view, CTX_STUB, state);

    // One MVP composed per planet, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(SCENE_PLANETS.length);
    SCENE_PLANETS.forEach((planet, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(planet.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(planet.radiusKm * SCALE_UNITS.KM_TO_MPC);
    });

    // Planet i drew through renderers[i] — exactly once each, with its own
    // albedo (the writeBuffer-race contract: never two draws through one
    // instance).
    SCENE_PLANETS.forEach((planet, i) => {
      const drawSpy = renderers[i]!.draw;
      expect(drawSpy).toHaveBeenCalledTimes(1);
      const [passArg, mvp, albedo] = drawSpy.mock.calls[0]!;
      expect(passArg).toBe(PASS_STUB);
      expect(mvp).toBeInstanceOf(Float32Array);
      expect(mvp).toHaveLength(16);
      expect(albedo).toBe(planet.albedo);
    });
  });

  it('is a no-op when the planetRenderers handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = { gpu: { planetRenderers: null } } as unknown as EngineState;
    expect(() => planetsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
