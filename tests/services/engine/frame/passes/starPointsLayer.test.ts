/**
 * starPointsLayer — unit tests for the far-partition star-points content row.
 *
 * Unlike the sphere-body layers, the load-bearing threading assertion here
 * is that the layer consumes the slab's f32-NARROWED `view.vp` (identity:
 * `toBe(view.vp)`) plus `view.viewportPx` — a star drawn as a point subtends
 * under a pixel, so the f32 narrowing error stays sub-pixel and the f64
 * seam the sphere layers need would buy nothing (same rationale as the
 * caption anchors in `foregroundLabelsLayer`).
 *
 * The star instances were uploaded at bootstrap via `setStars`, so `draw`
 * carries no per-frame star data — just the camera threading.
 */

import { describe, it, expect, vi } from 'vitest';

import { starPointsLayer } from '../../../../../src/services/engine/frame/passes/starPointsLayer';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneBodies';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarBody } from '../../../../../src/@types/scene/StarBody';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// ctx is unread by this layer (everything it threads lives on the SlabView),
// so a bare cast satisfies the signature.
const CTX_STUB = {} as ReadyFrameContext;

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so identity checks reveal which one the layer threads — here the
 * f32 narrow is the CORRECT choice.
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

/** State with a `starPointRenderer` handle and a seeded star list. */
function makeState(starPointRenderer: unknown, stars: readonly StarBody[]): EngineState {
  return {
    gpu: { starPointRenderer },
    data: { bodies: { stars } },
  } as unknown as EngineState;
}

describe('starPointsLayer.enabled', () => {
  it('is false while starPointRenderer is null and while no far-partition star is seeded; true with both', () => {
    const renderer = { draw: vi.fn() };
    // Null handle. NOTE: deliberately no state.data — the handle check must
    // short-circuit BEFORE the bodies read (renderFrame fixtures carry no
    // bodies bag).
    expect(
      starPointsLayer.enabled(
        { gpu: { starPointRenderer: null } } as unknown as EngineState,
        CTX_STUB,
      ),
    ).toBe(false);
    // Renderer only — the Sun alone is entirely near-partition.
    const sunOnly = SCENE_STARS.filter((star) => star.id === 'sun');
    expect(starPointsLayer.enabled(makeState(renderer, sunOnly), CTX_STUB)).toBe(false);
    // Renderer + the full seed (24 far-partition neighbours).
    expect(starPointsLayer.enabled(makeState(renderer, SCENE_STARS), CTX_STUB)).toBe(true);
  });
});

describe('starPointsLayer.draw', () => {
  it('threads view.vp and view.viewportPx to starPointRenderer.draw', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SCENE_STARS);

    starPointsLayer.draw(PASS_STUB, view, CTX_STUB, state);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, vpArg, viewportArg] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    // The f32 narrow is the CORRECT vp for point anchors — identity-pinned
    // against the deliberately distinct f64 slab vp.
    expect(vpArg).toBe(view.vp);
    expect(vpArg).not.toBe(view.slab.vp);
    expect(viewportArg).toBe(view.viewportPx);
  });

  it('is a no-op when the starPointRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = { gpu: { starPointRenderer: null } } as unknown as EngineState;
    expect(() => starPointsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
