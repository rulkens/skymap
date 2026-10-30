/**
 * tileBodiesInView — names exactly the tiling body the view gives a `body-m`
 * slab, over the 1 px edge, a body behind the eye and a host only a mesh body
 * re-admits.
 */

import { describe, expect, it } from 'vitest';

import { tileBodiesInView } from '../../../../../src/layers/body/subsystems/surfaceTiles/tileBodiesInView';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { isSurfaceTileBodyId } from '../../../../../src/layers/body/subsystems/surfaceTiles/isSurfaceTileBodyId';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const STATES = deriveBodyStates(CONST_J2000);
const NEAR_DISTANCE_MPC = 1e-12;
const firstTileBody = (view: FrameView) => tileBodiesInView(view)[0] ?? null;

/** What `deriveSlabs` built: the first tiling host's slab. */
function slabAnswer(view: FrameView): string | null {
  const hosts = view.slabs.flatMap((slab) =>
    slab.frame.kind === 'body-m' && isSurfaceTileBodyId(slab.frame.hostId)
      ? [slab.frame.hostId]
      : [],
  );
  expect(hosts.length).toBeLessThanOrEqual(1);
  return hosts[0] ?? null;
}

/** Eye `distanceM` from `bodyId` along `dir`, looking at it (or away). */
function viewNear(bodyId: string, dir: Vec3, distanceM: number, lookAway = false): FrameView {
  const body = STATES.get(asSceneBodyId(bodyId))!.positionMpc;
  const d = distanceM * SCALE_UNITS.M_TO_MPC;
  const toward: Vec3 = [-dir[0], -dir[1], -dir[2]];
  return frameViewsAt({
    eyeMpc: [body[0] + dir[0] * d, body[1] + dir[1] * d, body[2] + dir[2] * d],
    forward: lookAway ? dir : toward,
    distanceMpc: NEAR_DISTANCE_MPC,
  })[0]!;
}

describe('tileBodiesInView', () => {
  it('names exactly the tiling bodies that get a body slab', () => {
    const dir = normalize3([0.3, -0.5, 0.8]);
    for (const [bodyId, radiusM] of [
      ['earth', 6.371e6],
      ['mars', 3.39e6],
    ] as const) {
      const outcomes = new Set<string | null>();
      // Geometric steps from low orbit out past the 1 px edge.
      for (let distanceM = 1.5 * radiusM; distanceM < 1e5 * radiusM; distanceM *= 1.3) {
        for (const lookAway of [false, true]) {
          const view = viewNear(bodyId, dir, distanceM, lookAway);
          const expected = slabAnswer(view);
          expect(firstTileBody(view), `${bodyId} at ${distanceM} m`).toBe(expected);
          outcomes.add(expected);
        }
      }
      expect(outcomes).toEqual(new Set([bodyId, null]));
    }
  });

  it('names a host only a mesh body re-admits', () => {
    // Beside Hubble, looking straight away from Earth: Earth's own disc is out of
    // the frustum cone, but Hubble, riding Earth's row, keeps the row alive.
    const earth = STATES.get(asSceneBodyId('earth'))!.positionMpc;
    const hubble = STATES.get(asSceneBodyId('hubble'))!.positionMpc;
    const out = normalize3([hubble[0] - earth[0], hubble[1] - earth[1], hubble[2] - earth[2]]);
    const back = 20 * SCALE_UNITS.M_TO_MPC;
    const [view] = frameViewsAt({
      eyeMpc: [hubble[0] - out[0] * back, hubble[1] - out[1] * back, hubble[2] - out[2] * back],
      forward: out,
      distanceMpc: NEAR_DISTANCE_MPC,
    });
    expect(slabAnswer(view!)).toBe('earth');
    expect(firstTileBody(view!)).toBe('earth');
  });
});
