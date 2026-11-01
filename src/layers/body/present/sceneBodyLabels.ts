/**
 * sceneBodyLabels — name captions for Earth and the planets (craft caption through the
 * missions Layer; stars, the Sun and the Galactic Centre through theirs). Tints come from the
 * body records (planet `albedo`, a fixed Earth blue), so no colour table drifts from the seeds.
 *
 * Captions go through the NEAR0 slab view (`labelsNearPass`, `view.vp`), not `ctx.vp`: the
 * main projection's near plane is 0.01 Mpc and the bodies sit ~1e-13 Mpc away, so it would
 * clip them. The slab view is renderOrigin-relative, as `composeBodyMvp` is.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { ForegroundCaption } from '../../../services/engine/presentation/foregroundCaption';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { compressBrightness } from '../../../utils/color/compressBrightness';
import type { BodyState } from '../../../@types/scene/BodyState';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';

// `EarthBody` carries a texture rather than a colour, so this is the one authored tint.
const EARTH_TINT: Readonly<Vec3> = [0.5, 0.72, 1];

/**
 * A raw albedo makes a dark body's caption dark text on a black sky (Mercury
 * and the Moon peak near 0.3). This exponent lifts them to ~0.7 while keeping
 * them dimmer than Venus or Enceladus, so the captions still rank by albedo.
 */
const PLANET_TINT_GAMMA = 0.3;

/**
 * Positions come from the caller's `bodyStates` snapshot, so captions follow the sim clock;
 * a paused clock returns the same map by reference and `labelsNearPass` memoises on that.
 */
export function sceneBodyLabels(bodyStates: ReadonlyMap<string, BodyState>): ForegroundCaption[] {
  return [
    bodyCaption(
      SCENE_EARTH,
      bodyFootprintRadiusM(SCENE_EARTH),
      bodyStates.get(SCENE_EARTH.id)!.positionMpc,
      EARTH_TINT,
      'earth',
    ),
    ...SCENE_PLANETS.map((planet) =>
      bodyCaption(
        planet,
        bodyFootprintRadiusM(planet),
        bodyStates.get(planet.id)!.positionMpc,
        compressBrightness(planet.albedo, PLANET_TINT_GAMMA),
        'planet',
      ),
    ),
  ];
}
