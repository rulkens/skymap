/**
 * structureMarkersCosmoPass — the draw gate reads the PLANNED list, the pick
 * gate the renderer's last upload, and both drop out past the surveyDeepZoom
 * band. Built over a stub runtime: neither gate touches the GPU.
 */

import { describe, it, expect } from 'vitest';

import { structureMarkersCosmoPass } from '../../../../src/layers/structure/passes/structureMarkersCosmoPass';
import { structureMarkersPlanner } from '../../../../src/layers/structure/frame';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRuntime } from '../../../../src/layers/structure/@types/StructureRuntime';
import type { StructureMarkerDescriptor } from '../../../../src/layers/structure/@types/StructureMarkerDescriptor';

const STATE_STUB = {} as EngineState;
const VIEW_STUB = {} as SlabView;

/** The default camera sits 5 Mpc from the origin, far outside the band. */
function makeCtx(drawCamPos: Readonly<[number, number, number]> = [0, 0, 5]): FrameView {
  return {
    drawCamPos,
    snapshot: { plans: createFramePlannerResultStore() },
  } as unknown as FrameView;
}

function passOver(markerCount: number) {
  const runtime = { cosmoRenderer: { markerCount: () => markerCount } };
  return structureMarkersCosmoPass(runtime as unknown as StructureRuntime);
}

/** Plan `count` markers for `ctx`, the way SCENE's own plan row does. */
function planMarkers(ctx: FrameView, count: number): FrameView {
  const planner = structureMarkersPlanner({} as StructureRuntime);
  ctx.snapshot.plans.put(planner, ctx, {
    value: Array.from({ length: count }, () => ({}) as StructureMarkerDescriptor),
    awake: false,
    settling: false,
  });
  return ctx;
}

// The renderer has uploaded nothing: `setMarkers` runs inside `draw`, which
// this gate is what admits, so a gate reading `markerCount()` would be false
// on every frame and the markers would never appear.
const EMPTY_RENDERER_PASS = passOver(0);

describe('structureMarkersPass.enabled', () => {
  it('gates on the PLANNED markers, not on what the renderer last uploaded', () => {
    const ctx = planMarkers(makeCtx(), 3);
    expect(EMPTY_RENDERER_PASS.enabled(STATE_STUB, ctx, VIEW_STUB)).toBe(true);
  });

  it('an empty planned list leaves the pass plan', () => {
    const ctx = planMarkers(makeCtx(), 0);
    expect(EMPTY_RENDERER_PASS.enabled(STATE_STUB, ctx, VIEW_STUB)).toBe(false);
  });

  it('disables once the surveyDeepZoom fade completes (opacity-zero principle)', () => {
    // Every marker fragment resolves to alpha 0 past the goneAt edge, so the
    // layer must leave the pass plan entirely — the executor drops the render
    // step, and `pickEnabled` applies the same band so the rings stop claiming
    // hits.
    const pass = passOver(3);
    const farCtx = planMarkers(makeCtx(), 3);
    expect(pass.enabled(STATE_STUB, farCtx, VIEW_STUB)).toBe(true);
    // Inside goneAt (0.002 Mpc) → disabled despite queued markers.
    const nearCtx = planMarkers(makeCtx([0, 0, 0.001]), 3);
    expect(pass.enabled(STATE_STUB, nearCtx, VIEW_STUB)).toBe(false);
  });
});

describe('structureMarkersPass.pickEnabled', () => {
  // The pick program derives its own context, whose `plans` no plan row has
  // filled — reading the planned list there would throw, so the pick gate
  // reads the renderer's own upload instead.
  it('reads the renderer, never the plan the pick context never ran', () => {
    const ctx = makeCtx();
    expect(EMPTY_RENDERER_PASS.pickEnabled!(STATE_STUB, ctx, VIEW_STUB)).toBe(false);
    expect(passOver(3).pickEnabled!(STATE_STUB, ctx, VIEW_STUB)).toBe(true);
  });
});
