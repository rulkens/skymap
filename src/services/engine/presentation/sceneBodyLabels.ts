/**
 * sceneBodyLabels — name captions for the true-scale foreground bodies core
 * captions: Earth, the planets and the mesh bodies, minus any body a Layer
 * claims (a Layer that claims a body captions it: the sampled craft through the
 * missions Layer's `produceMissionCaptions`). The seeded stars, the Sun and the
 * Galactic Centre are not scene bodies here, and caption through their Layers.
 *
 * The scene bodies render true-scale in the foreground/HDR passes, so at
 * almost every zoom level they are sub-pixel and impossible to locate by
 * eye. These labels anchor a name to each body's world position, giving
 * the descent toward the solar system something to aim at.
 *
 * Sourced from the seed set (`SCENE_EARTH` + `SCENE_PLANETS` +
 * `SCENE_MESH_BODIES`), each tinted by its own authored colour: a planet's or
 * mesh body's brightened `albedo`, and a fixed tint for Earth, which carries a texture
 * instead of a colour. Deriving the tints from the body records keeps this
 * file free of a parallel colour table that would drift from the seeds.
 *
 * ### Why the foreground projection, not the main one
 *
 * The main camera projection is pinned at near = 0.01 Mpc.  At solar-system
 * zoom the bodies sit ~1e-13 Mpc from the camera — far inside that near
 * plane — so the normal label path (which projects with `ctx.vp`) would
 * clip them away.  `labelsNearPass` instead draws these through the
 * NEAR0 slab view (`view.vp`), whose near plane is proportional to
 * `cam.distance` and so always contains the bodies.
 *
 * ### Why renderOrigin-relative positions
 *
 * The NEAR0 slab view is built relative to `renderOrigin`: every position
 * handed to it must already have the origin subtracted (the same contract
 * `composeBodyMvp` honours for the sphere MVPs).  With `RENDER_ORIGIN_MPC`
 * fixed at the Sun ([0, 0, 0]) the subtraction is numerically a no-op
 * today, but doing it here keeps the labels correct by construction if a
 * future floating origin moves.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { ForegroundCaption } from './foregroundCaption';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { ANCHORED_MESH_BODY_IDS } from '../../../data/bodies/anchoredMeshBodyIds';
import { compressBrightness } from '../../../utils/color/compressBrightness';
import type { BodyState } from '../../../@types/scene/BodyState';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';
import { meshBodyCaption } from '../../../utils/labels/meshBodyCaption';

/**
 * Earth's caption tint. `EarthBody` carries a texture rather than a colour,
 * so this is the one hand-authored tint in the set — the same Earth blue
 * the captions have always used.
 */
const EARTH_TINT: Readonly<Vec3> = [0.5, 0.72, 1];

/**
 * A raw albedo makes a dark body's caption dark text on a black sky (Mercury
 * and the Moon peak near 0.3). This exponent lifts them to ~0.7 while keeping
 * them dimmer than Venus or Enceladus, so the captions still rank by albedo.
 */
const PLANET_TINT_GAMMA = 0.3;

/**
 * Build one name label per core seeded scene body, positioned relative to
 * `RENDER_ORIGIN_MPC` for the foreground view-projection.
 *
 * Every body reads its position from the caller's `bodyStates` snapshot (the
 * per-frame `deriveBodyStates(simDays)` map), so Earth's and the planets'
 * captions FOLLOW them as the sim clock advances. The caller re-invokes this only
 * when the snapshot actually changes — a paused clock returns the same map by
 * reference, so a fresh instant is the only thing that rebuilds the captions
 * (see `labelsNearPass`'s memo).
 */
export function sceneBodyLabels(
  bodyStates: ReadonlyMap<string, BodyState>,
  simDays: number,
  claimed: ReadonlySet<string>,
): ForegroundCaption[] {
  return [
    ...(claimed.has(SCENE_EARTH.id)
      ? []
      : [
          bodyCaption(
            SCENE_EARTH,
            bodyFootprintRadiusM(SCENE_EARTH),
            bodyStates.get(SCENE_EARTH.id)!.positionMpc,
            EARTH_TINT,
            'earth',
          ),
        ]),
    ...SCENE_PLANETS.filter((planet) => !claimed.has(planet.id)).map((planet) =>
      bodyCaption(
        planet,
        bodyFootprintRadiusM(planet),
        bodyStates.get(planet.id)!.positionMpc,
        compressBrightness(planet.albedo, PLANET_TINT_GAMMA),
        'planet',
      ),
    ),
    // An anchored scan is ground, not an object on it, so it goes uncaptioned
    // (and unpicked, see meshBodiesPass).
    ...SCENE_MESH_BODIES.filter(
      (body) =>
        !ANCHORED_MESH_BODY_IDS.has(body.id) &&
        !claimed.has(body.id) &&
        spacecraftPresent(body.id, simDays),
    ).map((body) => meshBodyCaption(body, bodyStates.get(body.id)!.positionMpc)),
  ];
}
