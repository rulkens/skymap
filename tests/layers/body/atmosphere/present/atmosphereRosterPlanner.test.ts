/**
 * atmosphereRosterPlanner — the once sky-view bake's roster must be exactly the union of
 * the per-view `drawsAtmosphere` predicate, or a view samples a table nobody baked. Real
 * views of a real frame, so the frustum gate is the one `deriveView` runs.
 */

import { describe, expect, it } from 'vitest';

import { atmosphereRosterPlanner } from '../../../../../src/layers/body/atmosphere/present/atmosphereRosterPlanner';
import { drawsAtmosphere } from '../../../../../src/layers/body/atmosphere/present/drawsAtmosphere';
import { ATMOSPHERE_BODIES } from '../../../../../src/layers/body/atmosphere/data/atmosphereBodies';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const EARTH = asSceneBodyId('earth');
const EARTH_POS = deriveBodyStates(CONST_J2000).get(EARTH)!.positionMpc;
const EARTH_RADIUS_M = 6.371e6;
const DIR = normalize3([0.3, -0.5, 0.8]);
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Half a turn about the view's up axis: a second rig view looking back.
const TURNED: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
const STATE = {} as PassState;

/** Rig views with the eye `distanceM` from Earth's centre along DIR, looking along `forward`. */
function viewsAt(distanceM: number, forward: Vec3, rotations: readonly Mat3[]): FrameView[] {
  const d = distanceM * SCALE_UNITS.M_TO_MPC;
  return frameViewsAt({
    eyeMpc: [EARTH_POS[0] + DIR[0] * d, EARTH_POS[1] + DIR[1] * d, EARTH_POS[2] + DIR[2] * d],
    forward,
    distanceMpc: 1e-12,
    rotations,
  });
}

const AWAY = DIR;
const TOWARD: Vec3 = [-DIR[0], -DIR[1], -DIR[2]];

function rosterOf(views: readonly FrameView[]): ReadonlySet<string> {
  return atmosphereRosterPlanner.plan(views[0]!.snapshot, views, STATE).value;
}

describe('atmosphereRosterPlanner', () => {
  it('equals the union of drawsAtmosphere over the rig views', () => {
    for (const views of [
      viewsAt(3 * EARTH_RADIUS_M, AWAY, [IDENTITY]),
      viewsAt(3 * EARTH_RADIUS_M, AWAY, [IDENTITY, TURNED]),
      viewsAt(EARTH_RADIUS_M + 10e3, AWAY, [IDENTITY]),
      viewsAt(1e3 * EARTH_RADIUS_M, TOWARD, [IDENTITY, TURNED]),
    ]) {
      const union = ATMOSPHERE_BODIES.filter((body) =>
        views.some((view) => drawsAtmosphere(body.id, view, STATE)),
      ).map((body) => body.id);
      expect([...rosterOf(views)].sort()).toEqual(union.sort());
    }
  });

  it('drops a body behind the only view', () => {
    expect(rosterOf(viewsAt(3 * EARTH_RADIUS_M, AWAY, [IDENTITY])).has(EARTH)).toBe(false);
  });

  it('keeps a body only a second rig view sees', () => {
    expect(rosterOf(viewsAt(3 * EARTH_RADIUS_M, AWAY, [IDENTITY, TURNED])).has(EARTH)).toBe(true);
  });

  it('keeps the host whose atmosphere encloses the eye, looking straight up', () => {
    expect(rosterOf(viewsAt(EARTH_RADIUS_M + 10e3, AWAY, [IDENTITY])).has(EARTH)).toBe(true);
  });

  it('drops a host whose slab survives but whose surface disc is sub-pixel', () => {
    // The slab gate measures the 1.05× proxy; at ~2030 radii only it clears 1 px.
    const views = viewsAt(2030 * EARTH_RADIUS_M, TOWARD, [IDENTITY]);
    const hasSlab = views[0]!.slabs.some(
      (slab) => slab.frame.kind === 'body-m' && slab.frame.hostId === EARTH,
    );
    expect(hasSlab).toBe(true);
    expect(rosterOf(views).has(EARTH)).toBe(false);
  });
});
