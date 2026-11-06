/**
 * atmosphereRosterPlanner — the sky-view bake runs once per frame off the canvas
 * view's draw list, so that list may drop a body only when NO rig view gives it a
 * slab, not merely when it is sub-pixel. Real views of a real frame, so the
 * frustum gate is the one `deriveView` runs.
 */

import { describe, expect, it } from 'vitest';

import { atmosphereDrawList } from '../../../../../src/layers/body/atmosphere/present/atmosphereDrawList';
import { atmosphereRosterPlanner } from '../../../../../src/layers/body/atmosphere/present/atmosphereRosterPlanner';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

const EARTH_POS = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!.positionMpc;
const EARTH_RADIUS_M = 6.371e6;
const DIR = normalize3([0.3, -0.5, 0.8]);
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Half a turn about the view's up axis: a second rig view looking back.
const TURNED: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
const STATE = {} as PassState;

/** Rig views with the eye `distanceM` from Earth's centre along DIR, looking further out. */
function viewsLookingAway(distanceM: number, rotations: readonly Mat3[]): FrameView[] {
  const d = distanceM * SCALE_UNITS.M_TO_MPC;
  return frameViewsAt({
    eyeMpc: [EARTH_POS[0] + DIR[0] * d, EARTH_POS[1] + DIR[1] * d, EARTH_POS[2] + DIR[2] * d],
    forward: DIR,
    distanceMpc: 1e-12,
    rotations,
  });
}

/** Earth's entry in the list the once bake reads (the first view stands in for the canvas). */
function earthEntry(views: readonly FrameView[]) {
  const { snapshot } = views[0]!;
  const roster = atmosphereRosterPlanner.plan(snapshot, views, STATE);
  snapshot.plans.put(atmosphereRosterPlanner, undefined, roster);
  return atmosphereDrawList(STATE, views[0]!).find((entry) => entry.body.id === 'earth');
}

describe('atmosphereRosterPlanner', () => {
  it('drops a body behind the only view', () => {
    expect(earthEntry(viewsLookingAway(3 * EARTH_RADIUS_M, [IDENTITY]))).toBeUndefined();
  });

  it('keeps a body only a second rig view sees', () => {
    expect(earthEntry(viewsLookingAway(3 * EARTH_RADIUS_M, [IDENTITY, TURNED]))).toBeDefined();
  });

  it('keeps the host whose atmosphere encloses the eye, looking straight up', () => {
    const entry = earthEntry(viewsLookingAway(EARTH_RADIUS_M + 10e3, [IDENTITY]));
    expect(entry?.inside).toBe(true);
  });
});
