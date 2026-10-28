/**
 * planSurfaceTiles — every tile decision against a plain-object residency:
 * position keeps the atlases and the readout, the views only gate the cut,
 * and the touched/requested split never lets a miss evict a tile in use.
 * The walk is stubbed to a chosen demand; its geometry has its own tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SurfaceTileDemand } from '../../../../../src/@types/scene/SurfaceTileDemand';
import type { SurfaceCutTile } from '../../../../../src/@types/scene/SurfaceCutTile';
import type { SurfaceTileId } from '../../../../../src/@types/data/SurfaceTileId';
import type { SurfaceTileManifest } from '../../../../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTileResidency } from '../../../../../src/@types/engine/surfaceTiles/SurfaceTileResidency';
import type { SurfaceTileOver } from '../../../../../src/@types/engine/surfaceTiles/SurfaceTileOver';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const walk = vi.hoisted(() => {
  const state: { demand: SurfaceTileDemand | null; calls: number } = { demand: null, calls: 0 };
  return state;
});
const CUT: readonly SurfaceCutTile[] = [];
vi.mock('../../../../../src/utils/surfaceTiles/cutSurfaceTiles', () => ({
  cutSurfaceTiles: () => {
    walk.calls++;
    return { cut: CUT, requests: walk.demand };
  },
}));

import { planSurfaceTiles } from '../../../../../src/services/engine/frame/surfaceTilePlanner/planSurfaceTiles';
import { tileBodiesInView } from '../../../../../src/services/engine/frame/surfaceTilePlanner/tileBodiesInView';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { baseLevelForTier } from '../../../../../src/utils/surfaceTiles/baseLevelForTier';
import { isSurfaceTileBodyId } from '../../../../../src/utils/surfaceTiles/isSurfaceTileBodyId';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';

function tileBody(id: string) {
  const bodyId = asSceneBodyId(id);
  if (!isSurfaceTileBodyId(bodyId)) throw new Error(`${id} has no surface tiles`);
  return bodyId;
}
const EARTH = tileBody('earth');
const MARS = tileBody('mars');
const RADIUS_M = { earth: 6.371e6, mars: 3.39e6 };
const STATES = deriveBodyStates(CONST_J2000);
const LARGE = () => 'large' as const;
const BASE = baseLevelForTier('earth', 'large');
const DEEPEST = 19;

const PROVENANCE = { sourceId: 'test', attribution: 'test', vintage: 'test' };
function manifestOf(prefix: string): SurfaceTileManifest {
  return {
    prefix,
    tilePx: 512,
    bands: [
      {
        bounds: { west: -180, south: -90, east: 180, north: 90 },
        min: 1,
        max: DEEPEST,
        builtFrom: { albedo: PROVENANCE, height: PROVENANCE },
      },
    ],
  };
}
const MANIFESTS = { earth: manifestOf('earth-tiles/v8'), mars: manifestOf('mars-tiles/v2') };

const SLOT = {
  slot: 0,
  atlasUvOrigin: [0, 0],
  atlasUvScale: [1, 1],
  readyAtMs: 0,
  subtreeRangeM: null,
} as const;

function residency(over: Partial<SurfaceTileResidency> = {}): SurfaceTileResidency {
  return {
    manifest: (bodyId) => ({ status: 'loaded', value: MANIFESTS[bodyId] }),
    residentSlot: () => null,
    isInFlight: () => false,
    hasFailed: () => false,
    inFlightCount: () => 0,
    engagedBodyId: () => EARTH,
    ...over,
  };
}

/** The eye `radii` body radii out along `dir`, looking at the body or away from it. */
function viewNear(bodyId: 'earth' | 'mars', radii: number, sees: boolean, dir: Vec3 = [1, 0, 0]) {
  const body = STATES.get(asSceneBodyId(bodyId))!.positionMpc;
  const d = radii * RADIUS_M[bodyId] * SCALE_UNITS.M_TO_MPC;
  return frameViewsAt({
    eyeMpc: [body[0] + dir[0] * d, body[1] + dir[1] * d, body[2] + dir[2] * d],
    forward: sees ? [-dir[0], -dir[1], -dir[2]] : dir,
    distanceMpc: 1e-12,
  })[0]!;
}
const SEES_EARTH = viewNear('earth', 3, true);
const SEES_MARS = viewNear('mars', 3, true);
const LOOKS_AWAY = viewNear('earth', 3, false);

const overBody = (bodyId: typeof EARTH, camPosLocalM: Vec3 = [3e7, 0, 0]): SurfaceTileOver => ({
  bodyId,
  camPosLocalM,
});
const tile = (x: number, product: SurfaceTileId['product'] = 'albedo'): SurfaceTileId => ({
  product,
  z: BASE + 1,
  x,
  y: 0,
});
function engagedDemand(tiles: readonly SurfaceTileId[]): SurfaceTileDemand {
  return {
    zWin: BASE + 1,
    requests: tiles.map((t, i) => ({ tile: t, screenPx: 1000 - i })),
  };
}

beforeEach(() => {
  walk.demand = engagedDemand([tile(0)]);
  walk.calls = 0;
});

describe('planSurfaceTiles', () => {
  it('looking up at street level keeps the position readout and plans nothing', () => {
    // Bug caught: the readout or the atlases follow the view instead of the position.
    const latRad = (55.68 * Math.PI) / 180;
    const lonRad = (12.57 * Math.PI) / 180;
    const up: Vec3 = [
      Math.cos(latRad) * Math.cos(lonRad),
      Math.cos(latRad) * Math.sin(lonRad),
      Math.sin(latRad),
    ];
    const streetM = RADIUS_M.earth + 2;
    // At street level the atmosphere keeps Earth's row in every view, so a view
    // that shows no Earth at all stands in for the walk culling every tile.
    expect(tileBodiesInView(LOOKS_AWAY)).toEqual([]);

    const plan = planSurfaceTiles(
      [LOOKS_AWAY],
      overBody(EARTH, [up[0] * streetM, up[1] * streetM, up[2] * streetM]),
      residency(),
      LARGE,
    );

    expect(plan.subCamera?.lonDeg).toBeCloseTo(12.57, 9);
    expect(plan.subCamera?.latDeg).toBeCloseTo(55.68, 9);
    expect(plan.subCamera?.coveredMaxLevel).toBe(DEEPEST);
    expect(plan.cut).toEqual([]);
    expect(plan.requests).toEqual([]);
    expect(plan.touched).toEqual([]);
    expect(plan.lastPlan).toBeNull();
    expect(plan.verdict).toBe('keep');
  });

  it('a body switch releases at once; out of reach releases; off-screen never does', () => {
    // Bug caught: atlases held long after leaving, or dropped on a turn of the head.
    expect(planSurfaceTiles([SEES_EARTH], overBody(MARS), residency(), LARGE).verdict).toBe(
      'release',
    );
    expect(planSurfaceTiles([SEES_EARTH], null, residency(), LARGE).verdict).toBe('release');
    expect(planSurfaceTiles([LOOKS_AWAY], overBody(EARTH), residency(), LARGE).verdict).toBe(
      'keep',
    );
    const none = residency({ engagedBodyId: () => null });
    expect(planSurfaceTiles([SEES_EARTH], null, none, LARGE).verdict).toBe('keep');
  });

  it('touched lists every resident requested key before any request', () => {
    // Bug caught: a miss allocated while a resident it shares the plan with still
    // carries last frame's LRU stamp evicts it, and the next one after it.
    const tiles = [tile(0), tile(1), tile(2), tile(3), tile(4, 'height'), tile(5, 'height')];
    walk.demand = engagedDemand(tiles);
    const resident = new Set([0, 2, 4]);

    const plan = planSurfaceTiles(
      [SEES_EARTH],
      overBody(EARTH),
      residency({ residentSlot: (t) => (resident.has(t.x) ? SLOT : null) }),
      LARGE,
    );

    expect(plan.touched).toEqual([tiles[0], tiles[2], tiles[4]]);
    expect(plan.requests.map((r) => r.tile)).toEqual([tiles[1], tiles[3], tiles[5]]);
    expect(plan.verdict).toBe('keep');
    expect(plan.cut).toBe(CUT);
  });

  it('a failed or in-flight tile is never requested again', () => {
    // Bug caught: a refetch storm on a 404, or a second fetch of a tile on its way.
    const tiles = [tile(0), tile(1), tile(2)];
    walk.demand = engagedDemand(tiles);
    const plan = planSurfaceTiles(
      [SEES_EARTH],
      overBody(EARTH),
      residency({
        hasFailed: (t) => t === tiles[0],
        isInFlight: (t) => t === tiles[1],
      }),
      LARGE,
    );

    expect(plan.requests.map((r) => r.tile)).toEqual([tiles[2]]);
    // In flight holds a slot the stream must stamp; failed holds nothing worth one.
    expect(plan.touched).toEqual([tiles[1]]);
    expect(plan.lastPlan).toEqual({ requestCount: 3, zWin: BASE + 1, misses: 3 });
  });

  it('asks for a missing manifest and plans nothing until it lands; never re-asks after a 404', () => {
    // Bug caught: a frame that sleeps mid-fetch, or a manifest 404 refetched forever.
    const absent = residency({
      manifest: () => ({ status: 'absent', value: null }),
      engagedBodyId: () => null,
    });
    const plan = planSurfaceTiles([SEES_EARTH], overBody(EARTH), absent, LARGE);
    expect(plan.wantManifest).toBe('earth');
    expect(plan.cut).toEqual([]);
    expect(plan.awake).toBe(true);
    expect(walk.calls).toBe(0);

    const pending = residency({ manifest: () => ({ status: 'pending', value: null }) });
    const whilePending = planSurfaceTiles([SEES_EARTH], overBody(EARTH), pending, LARGE);
    expect(whilePending.wantManifest).toBeNull();
    expect(whilePending.awake).toBe(true);

    const failed = residency({ manifest: () => ({ status: 'failed', value: null }) });
    const afterFailure = planSurfaceTiles([SEES_EARTH], overBody(EARTH), failed, LARGE);
    expect(afterFailure.wantManifest).toBeNull();
    expect(afterFailure.awake).toBe(false);
  });

  it("never reads another body's atlas: a switch engages with every tile a miss", () => {
    // Bug caught: Earth's resident slots drawn as Mars tiles, under Mars's ids,
    // or Earth's failures blocking Mars's fetches of the same (z, x, y).
    walk.demand = engagedDemand([tile(0), tile(1)]);
    const plan = planSurfaceTiles(
      [SEES_MARS],
      overBody(MARS),
      residency({ residentSlot: () => SLOT, hasFailed: () => true, isInFlight: () => true }),
      LARGE,
    );

    expect(plan.verdict).toEqual({ engage: 'mars', tilePx: 512 });
    expect(plan.touched).toEqual([]);
    expect(plan.requests).toHaveLength(2);
  });

  it('engages on the very demand a finer-tiered session stands down on', () => {
    // Bug caught: a base level fixed at the largest tier's leaves a default
    // `medium` session on z3 ground while the screen wants z5.
    walk.demand = { ...engagedDemand([tile(0)]), zWin: BASE };
    const fresh = residency({ engagedBodyId: () => null });

    const medium = planSurfaceTiles([SEES_EARTH], overBody(EARTH), fresh, () => 'medium');
    expect(medium.verdict).toEqual({ engage: 'earth', tilePx: 512 });
    expect(medium.lastPlan).not.toBeNull();

    const large = planSurfaceTiles([SEES_EARTH], overBody(EARTH), fresh, LARGE);
    expect(large.verdict).toBe('keep');
    expect(large.lastPlan).toBeNull();
    expect(large.requests).toEqual([]);
  });

  it('stays awake while fetches are in flight, over nothing', () => {
    const plan = planSurfaceTiles([LOOKS_AWAY], null, residency({ inFlightCount: () => 1 }), LARGE);
    expect(plan.awake).toBe(true);
  });

  it('votes awake on the frame that first issues requests', () => {
    // Bug caught: the vote read before this plan's own requests exist, so the
    // engaging frame sleeps with nothing yet in flight.
    const fresh = residency({ engagedBodyId: () => null });
    expect(planSurfaceTiles([SEES_EARTH], overBody(EARTH), fresh, LARGE).awake).toBe(true);
  });

  it("carries the over body's params at its committed tier, for the terrain climb", () => {
    // Bug caught: `heightAt` climbing from a base level the cut was not walked from.
    const plan = planSurfaceTiles([LOOKS_AWAY], overBody(EARTH), residency(), () => 'medium');
    expect(plan.params?.baseLevel).toBe(baseLevelForTier('earth', 'medium'));
  });
});
