/**
 * partitionStarsByResolution — unit tests for the star LOD partition.
 *
 * The partition is the ONE branch point deciding whether a star draws as a
 * foreground sphere (`starSpheresLayer`) or an additive backdrop point
 * (`starPointsLayer`), so these tests pin the two behaviours the layers
 * lean on: apparent size drives membership (a star you are practically on
 * top of resolves, a star parsecs away stays a point), and the Sun is
 * `alwaysResolved` — it lands in `spheres` even at galaxy scale where its
 * apparent size is deep sub-pixel (and where `apparentSizePx`'s
 * distance<=0 guard would otherwise return 0 with the camera sitting on it).
 *
 * Fixtures come from the real `SCENE_STARS` seed so the predicate is
 * exercised against real solar radii and parsec-scale positions rather
 * than round numbers a unit bug could accidentally satisfy.
 */

import { describe, it, expect } from 'vitest';

import {
  partitionStarsByResolution,
  STAR_RESOLVE_PX,
} from '../../../../src/services/engine/frame/partitionStarsByResolution';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const SUN = SCENE_STARS.find((star) => star.id === 'sun')!;
const PROXIMA = SCENE_STARS.find((star) => star.id === 'proxima-centauri')!;
const SIRIUS = SCENE_STARS.find((star) => star.id === 'sirius')!;

const VIEWPORT_HEIGHT_PX = 720;
const FOV_Y_RAD = Math.PI / 3;

/**
 * A camera half an AU from the given position: a solar-diameter sphere at
 * that range subtends ~12 px in a 720-px, 60°-fov viewport — comfortably
 * above STAR_RESOLVE_PX — while every star parsecs away stays sub-pixel.
 */
function halfAuFrom(positionMpc: Readonly<Vec3>): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

describe('partitionStarsByResolution', () => {
  it('partitionStarsByResolution puts a near large star in spheres and a far small star in points', () => {
    // Both fixtures are ordinary (not alwaysResolved) stars, so membership
    // comes purely from the apparent-size threshold: the camera hovers half
    // an AU off Proxima while Sirius sits parsecs away.
    const { spheres, points } = partitionStarsByResolution({
      stars: [PROXIMA, SIRIUS],
      camPosMpc: halfAuFrom(PROXIMA.positionMpc),
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
      fovYRad: FOV_Y_RAD,
    });

    expect(spheres.map((star) => star.id)).toEqual(['proxima-centauri']);
    expect(points.map((star) => star.id)).toEqual(['sirius']);
    // Identity preserved — the layers read positionMpc/color off the same
    // seed records, never copies.
    expect(spheres[0]).toBe(PROXIMA);
    expect(points[0]).toBe(SIRIUS);
  });

  it('partitionStarsByResolution always resolves the Sun', () => {
    // Galaxy-scale camera: 0.43 Mpc out, every star (Sun included) subtends
    // far below a pixel — only the alwaysResolved override keeps the Sun a
    // sphere.
    const { spheres, points } = partitionStarsByResolution({
      stars: SCENE_STARS,
      camPosMpc: [0, 0, 0.43],
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
      fovYRad: FOV_Y_RAD,
    });

    expect(spheres).toEqual([SUN]);
    // Disjoint + exhaustive: everyone else is a point, nobody is dropped.
    expect(points).toHaveLength(SCENE_STARS.length - 1);
    expect(points).not.toContain(SUN);
  });
});
