/**
 * structureMarkersCosmoPass — the draw gate reads the PLANNED list, the pick
 * gate the renderer's last upload, and both drop out once every category of the
 * pass's own scale is 0. Built over a stub runtime: neither gate touches the GPU.
 */

import { describe, it, expect } from 'vitest';

import { structureMarkersCosmoPass } from '../../../../src/layers/structure/passes/structureMarkersCosmoPass';
import { structureMarkersPlanner } from '../../../../src/layers/structure/frame';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { STRUCTURE_IDS_BY_SCALE } from '../../../../src/data/structure/structureIdsByScale';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import type { StructureId } from '../../../../src/@types/data/structure/StructureId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRuntime } from '../../../../src/layers/structure/@types/StructureRuntime';
import type { StructureMarkerDescriptor } from '../../../../src/layers/structure/@types/StructureMarkerDescriptor';

const fadeOf = (live: readonly string[]): Record<StructureId, number> =>
  Object.fromEntries(STRUCTURE_IDS.map((id) => [id, live.includes(id) ? 1 : 0])) as Record<
    StructureId,
    number
  >;
const COSMIC_LIVE = fadeOf(STRUCTURE_IDS_BY_SCALE.cosmic);
const NONE_LIVE = fadeOf([]);
const MILKY_WAY_LIVE = fadeOf(STRUCTURE_IDS_BY_SCALE.milkyWay);

const STATE_STUB = {} as EngineState;
const VIEW_STUB = {} as SlabView;

function makeCtx(): FrameView {
  return {
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
    expect(EMPTY_RENDERER_PASS.enabled(STATE_STUB, ctx, VIEW_STUB, COSMIC_LIVE)).toBe(true);
  });

  it('an empty planned list leaves the pass plan', () => {
    const ctx = planMarkers(makeCtx(), 0);
    expect(EMPTY_RENDERER_PASS.enabled(STATE_STUB, ctx, VIEW_STUB, COSMIC_LIVE)).toBe(false);
  });

  it('disables once every cosmic category is 0, even with the other scale live', () => {
    const pass = passOver(3);
    const ctx = planMarkers(makeCtx(), 3);
    expect(pass.enabled(STATE_STUB, ctx, VIEW_STUB, COSMIC_LIVE)).toBe(true);
    expect(pass.enabled(STATE_STUB, ctx, VIEW_STUB, NONE_LIVE)).toBe(false);
    expect(pass.enabled(STATE_STUB, ctx, VIEW_STUB, MILKY_WAY_LIVE)).toBe(false);
  });
});

describe('structureMarkersPass.pickEnabled', () => {
  // The pick program derives its own context, whose `plans` no plan row has
  // filled — reading the planned list there would throw, so the pick gate
  // reads the renderer's own upload instead.
  it('reads the renderer, never the plan the pick context never ran', () => {
    const ctx = makeCtx();
    expect(EMPTY_RENDERER_PASS.pickEnabled!(STATE_STUB, ctx, VIEW_STUB, COSMIC_LIVE)).toBe(false);
    expect(passOver(3).pickEnabled!(STATE_STUB, ctx, VIEW_STUB, COSMIC_LIVE)).toBe(true);
    expect(passOver(3).pickEnabled!(STATE_STUB, ctx, VIEW_STUB, NONE_LIVE)).toBe(false);
  });
});
