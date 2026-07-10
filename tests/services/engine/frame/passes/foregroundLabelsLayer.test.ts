/**
 * foregroundLabelsLayer — unit tests for the near-field caption row.
 *
 * Two things are load-bearing here:
 *
 *   1. The three-clause `enabled` gate: a non-null second label renderer, a
 *      non-empty glyph set, AND a camera closer than the kiloparsec distance
 *      threshold. Above that distance the Sun/Earth are an irrelevant speck at
 *      the galactic centre and the captions would just clutter the normal view.
 *
 *   2. `draw` threads the resolved `SlabView`'s f32 `vp`/`viewportPx` to the
 *      label renderer — NOT `ctx.vp`/`ctx.canvasSize`. The near0 slab's f32 vp
 *      is amply precise for a caption anchor at the zooms where the gate opens.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  foregroundLabelsLayer,
  SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
} from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `enabled` reads only `ctx.cam.distance`; a bare cast at the requested
// distance satisfies the signature without a full frame-context fixture.
function makeCtx(distance: number): ReadyFrameContext {
  return { cam: { distance } } as unknown as ReadyFrameContext;
}

// A foreground label renderer whose glyphCount is fixed per test. Only the
// fields the layer reads are populated; the rest of LabelRenderer is unused.
function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    draw: vi.fn<(...args: unknown[]) => void>(),
    glyphCount: () => glyphCount,
  } as unknown as LabelRenderer;
}

function makeState(renderer: LabelRenderer | null): EngineState {
  return { gpu: { foregroundLabelRenderer: renderer } } as unknown as EngineState;
}

/**
 * A NEAR0 SlabView whose f32 `vp` and `viewportPx` are recognisable, so the
 * draw test can assert the layer forwarded exactly them (by identity) rather
 * than re-deriving from ctx.
 */
function makeNear0View(): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
  };
  return {
    slab,
    vp: Float32Array.from({ length: 16 }, (_, i) => i + 0.5),
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

describe('foregroundLabelsLayer.enabled', () => {
  it('respects the kiloparsec distance gate', () => {
    const renderer = makeRenderer(6);
    const state = makeState(renderer);

    // Well inside a kiloparsec with glyphs present → captions show.
    expect(foregroundLabelsLayer.enabled(state, makeCtx(5e-4))).toBe(true);

    // At and above the threshold → captions hidden (no clutter at galaxy scale).
    expect(foregroundLabelsLayer.enabled(state, makeCtx(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC))).toBe(
      false,
    );
    expect(foregroundLabelsLayer.enabled(state, makeCtx(1e-2))).toBe(false);

    // No glyphs → nothing to draw even when close.
    expect(foregroundLabelsLayer.enabled(makeState(makeRenderer(0)), makeCtx(5e-4))).toBe(false);

    // Pre-bootstrap: the second label renderer hasn't been constructed yet.
    expect(foregroundLabelsLayer.enabled(makeState(null), makeCtx(5e-4))).toBe(false);
  });
});

describe('foregroundLabelsLayer.draw', () => {
  it('threads the SlabView vp and viewport to the label renderer', () => {
    const renderer = makeRenderer(6);
    const state = makeState(renderer);
    const view = makeNear0View();

    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state);

    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    // The f32-narrowed near0 vp, NOT the slab's f64 vp — a caption anchor
    // doesn't need the f64 seam the sphere-body layers rely on.
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toBe(view.viewportPx);
  });
});
