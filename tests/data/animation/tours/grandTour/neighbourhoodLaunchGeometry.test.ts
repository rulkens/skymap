/**
 * Regression test for a real bug: an earlier version of this beat pair put
 * the M81 Group landing on `localGroupDwell` (14s before the flythrough,
 * with the camera 4.5 Mpc off the barycentre). That swung the flythrough's
 * launch EYE — not just its aim — ~6.7 Mpc around the orbit, producing a
 * ~41° whip pan the flythrough was built not to have (`neighbourhoodFlythrough.ts`
 * header: "no opening swing").
 *
 * The fix moves the landing onto `neighbourhoodReveal`'s dwell — the beat
 * immediately before the flythrough, whose `target` never moves across its
 * own window — via `spinToId`. This test chains `localGroupDwell` →
 * `neighbourhoodReveal` through the real `resolveClipFoci` pass (not
 * reimplemented arithmetic) and asserts the live yaw at the end of that
 * chain lands on the M81 Group's true bearing, essentially exactly.
 */

import { describe, it, expect } from 'vitest';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { localGroupDwell } from '../../../../../src/data/animation/tours/grandTour/localGroup';
import { neighbourhoodReveal } from '../../../../../src/data/animation/tours/grandTour/neighbourhoodReveal';
import { orbitAnglesLookingAlong } from '../../../../../src/utils/camera/orbitAnglesLookingAlong';
import type { ResolveDeps } from '../../../../../src/@types/engine/ResolveDeps';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Effect } from '../../../../../src/@types/animation/Effect';

const FOV_Y = 0.8;
const LG_POS: Vec3 = [0, 0, 0];
// A subject placed off-axis (not on the arrival bearing), 3.6 Mpc out —
// realistic scale for the M81 Group from the Local Group barycentre.
const M81_POS: Vec3 = [-3.6 * Math.sin(0.6), 0, -3.6 * Math.cos(0.6)];

const LOCAL_GROUP: StructureInfo = {
  type: 'structure',
  category: 'group',
  id: 'group-local-group',
  name: 'Local Group',
  worldPos: LG_POS,
  featured: true,
  physicalRadiusMpc: 1,
} as StructureInfo;

const M81_GROUP: StructureInfo = {
  type: 'structure',
  category: 'group',
  id: 'group-m81-group',
  name: 'M81 Group',
  worldPos: M81_POS,
  featured: true,
  physicalRadiusMpc: 0.5,
} as StructureInfo;

const DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: {
    byId: (id) =>
      id === 'group-local-group' ? LOCAL_GROUP : id === 'group-m81-group' ? M81_GROUP : null,
  },
  stars: { current: () => null },
};

/**
 * Find the yaw `spin` node's `by` anywhere in a resolved clip's timeline.
 * `localGroupDwell` nests it directly under the top `all`;
 * `neighbourhoodReveal` nests its dwellDrift `all` alongside a `seq` (the
 * dolly/focus release) inside an outer `all` — a plain recursive search
 * doesn't care which shape it finds.
 */
function yawSpinBy(resolved: { timeline: Effect[] }): number {
  const found = resolved.timeline.map(findYawSpin).find((by) => by !== undefined);
  if (found === undefined) throw new Error('expected a yaw spin node somewhere in the timeline');
  return found;
}

function findYawSpin(effect: Effect): number | undefined {
  if (effect.kind === 'spin' && effect.ch === 'yaw') return effect.by;
  if (effect.kind === 'seq' || effect.kind === 'all') {
    for (const child of effect.children) {
      const found = findYawSpin(child);
      if (found !== undefined) return found;
    }
  }
  if (effect.kind === 'fork') return findYawSpin(effect.child);
  return undefined;
}

describe('neighbourhoodReveal lands the flythrough launch bearing, not localGroupDwell', () => {
  it('the live yaw after localGroupDwell + neighbourhoodReveal matches the M81 Group bearing', () => {
    const arrivalYaw = 0.804001; // an arbitrary but realistic arrival bearing
    const fromEnteringLocalGroupDwell = {
      target: LG_POS,
      yaw: arrivalYaw,
      pitch: 0,
      distance: 5,
    };
    const resolvedLocalGroupDwell = resolveClipFoci(
      localGroupDwell,
      DEPS,
      FOV_Y,
      fromEnteringLocalGroupDwell,
    );
    const yawAfterLocalGroupDwell = arrivalYaw + yawSpinBy(resolvedLocalGroupDwell);

    // localGroupDwell must NOT already sit on the M81 bearing — if it does,
    // the landing regressed back onto the wrong beat (the whole point of
    // this fix is that it lands two beats later, with the target stationary).
    const trueBearing = orbitAnglesLookingAlong([
      M81_POS[0] - LG_POS[0],
      M81_POS[1] - LG_POS[1],
      M81_POS[2] - LG_POS[2],
    ]).yaw;
    const gapAfterLocalGroupDwell = Math.abs(wrapPi(yawAfterLocalGroupDwell - trueBearing));
    expect(gapAfterLocalGroupDwell).toBeGreaterThan(0.5); // a real remaining arc, not ~0

    // neighbourhoodReveal's target is unchanged from localGroup's enter clip
    // (LG_POS) — its dwell is what must close the remaining arc exactly.
    const fromEnteringReveal = {
      target: LG_POS,
      yaw: yawAfterLocalGroupDwell,
      pitch: 0,
      distance: 5,
    };
    const resolvedReveal = resolveClipFoci(neighbourhoodReveal, DEPS, FOV_Y, fromEnteringReveal);
    const yawAfterReveal = yawAfterLocalGroupDwell + yawSpinBy(resolvedReveal);

    const launchGapDeg = (Math.abs(wrapPi(yawAfterReveal - trueBearing)) * 180) / Math.PI;
    expect(launchGapDeg).toBeLessThan(1e-9);
  });
});

/** Wrap a radian delta into (-π, π]. */
function wrapPi(a: number): number {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
}
