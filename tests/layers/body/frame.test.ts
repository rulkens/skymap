/**
 * surfaceTilePlanner — the body Layer's once-per-frame tile row: it writes the runtime's plan,
 * applies it, votes the loop awake through a fetch, and publishes the DebugPanel's tile readout.
 */

import { describe, it, expect, vi } from 'vitest';

import { surfaceTilePlanner } from '../../../src/layers/body/frame';
import { planSurfaceTiles } from '../../../src/layers/body/surfaceTiles/plan/subsystems/planSurfaceTiles';
import { SURFACE_TILE_CROSSFADE_MS } from '../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import { createSurfaceTileStream } from '../../../src/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream';
import { IDLE_SURFACE_TILE_PLAN } from '../../../src/layers/body/surfaceTiles/plan/subsystems/idleSurfaceTilePlan';
import { throttleWithTrailingCall } from '../../../src/utils/throttle/throttleWithTrailingCall';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import type { BodyRuntime } from '../../../src/layers/body/@types/BodyRuntime';
import type { BodyFacts } from '../../../src/layers/body/@types/BodyFacts';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { SurfaceTilePlan } from '../../../src/layers/body/surfaceTiles/plan/@types/SurfaceTilePlan';

// Passes through to the real planner; one test stubs the plan it returns.
vi.mock(
  '../../../src/layers/body/surfaceTiles/plan/subsystems/planSurfaceTiles',
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import('../../../src/layers/body/surfaceTiles/plan/subsystems/planSurfaceTiles')
      >();
    return { planSurfaceTiles: vi.fn(real.planSurfaceTiles) };
  },
);

const STATE = {
  tier: 'medium',
  settings: { terrainPickMarker: { enabled: false } },
} as unknown as PassState;

function snapshotAt(nowMs: number): ReadyFrameContext {
  return { nowMs } as unknown as ReadyFrameContext;
}

describe('surfaceTilePlanner', () => {
  it("the planner's wake and loading votes hold while the manifest is in flight, never settling", () => {
    // Bug caught: the plan's wake vote never reaching the loop, or the cold-load gate
    // (sceneSettled) reading a streaming surface as settled. A landing tile wakes the
    // loop itself; a landing manifest does not, so only this vote carries it through the fetch.
    // A `settling` vote re-baked the solar-system sky cubemap every frame a tile was in
    // flight (+36 ms GPU), and tiles draw in no sky capture.
    const apply = vi.fn();
    const residency = {
      manifest: () => ({ status: 'pending', value: null }),
      residentSlot: () => null,
      isInFlight: () => false,
      hasFailed: () => false,
      inFlightCount: () => 0,
      engagedBodyId: () => null,
    };
    const runtime = {
      surfaceTiles: { stream: { residency, apply }, plan: IDLE_SURFACE_TILE_PLAN },
      textureSlots: new Map(),
      debugPanelOpen: () => false,
      publish: vi.fn(),
    } as unknown as BodyRuntime;
    // Over Earth, 1 km up, but no body row is active, so no view shows it and no cut is walked.
    const view = {
      cam: {},
      snapshot: { bodyStates: new Map(), slabBodyCandidates: [], meshBodies: [] },
      drawPxPerRad: 1000,
      frustum: { tanLeft: -1, tanRight: 1, tanDown: -1, tanUp: 1 },
      bodyPose: (id: string) =>
        id === 'earth' ? { eyeRelBodyM: [SCENE_EARTH.surface.datumRadiusM + 1000, 0, 0] } : null,
    } as unknown as FrameView;

    const result = surfaceTilePlanner(runtime).plan(snapshotAt(0), [view], STATE);

    expect(result.awake).toBe(true);
    expect(result.loading).toBe(true);
    expect(result.settling).toBe(false);
    expect(runtime.surfaceTiles.plan.awake).toBe(true);
    expect(apply).toHaveBeenCalledWith(runtime.surfaceTiles.plan);
  });

  it('a landed tile still crossfading from its fallback votes awake and loading, never settling', () => {
    // Bug caught: the loop slept, and `settled()` resolved, mid-crossfade, so the
    // frame froze half-blended and two shots of one link differed.
    const fadingTile = { albedo: { fallback: {}, readyAtMs: 1000 } };
    const runtime = {
      surfaceTiles: { stream: { apply: vi.fn() }, plan: IDLE_SURFACE_TILE_PLAN },
      textureSlots: new Map(),
      debugPanelOpen: () => false,
    } as unknown as BodyRuntime;
    const plan = { ...IDLE_SURFACE_TILE_PLAN, cut: [fadingTile] } as unknown as SurfaceTilePlan;
    vi.mocked(planSurfaceTiles).mockReturnValueOnce(plan).mockReturnValueOnce(plan);
    const planner = surfaceTilePlanner(runtime);

    const mid = planner.plan(snapshotAt(1000 + SURFACE_TILE_CROSSFADE_MS / 2), [], STATE);
    expect([mid.awake, mid.loading, mid.settling]).toEqual([true, true, false]);
    const done = planner.plan(snapshotAt(1000 + SURFACE_TILE_CROSSFADE_MS), [], STATE);
    expect([done.awake, done.loading]).toEqual([false, false]);
  });

  it('the tile readout publishes only while the debug panel is open, at most every 250 ms', () => {
    // Bug caught: a dispatch every frame, or one while no panel can read it.
    let open = false;
    const publish = vi.fn<(patch: Partial<BodyFacts>) => void>();
    const runtime = {
      surfaceTiles: {
        stream: createSurfaceTileStream({ device: {} as GPUDevice, requestRender: () => {} }),
        plan: IDLE_SURFACE_TILE_PLAN,
      },
      textureSlots: new Map(),
      debugPanelOpen: () => open,
      publish,
      readoutGate: throttleWithTrailingCall(250, () => {}),
    } as unknown as BodyRuntime;
    const planner = surfaceTilePlanner(runtime);

    for (let frame = 0; frame < 20; frame++) planner.plan(snapshotAt(frame * 16), [], STATE);
    expect(publish).not.toHaveBeenCalled();

    open = true;
    for (let nowMs = 1000; nowMs < 1300; nowMs += 16) planner.plan(snapshotAt(nowMs), [], STATE);
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
