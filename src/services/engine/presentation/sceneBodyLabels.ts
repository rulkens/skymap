/**
 * sceneBodyLabels — name captions for the true-scale foreground bodies core
 * still owns: Earth, the planets and the mesh bodies (the seeded stars, the
 * Sun and the Galactic Centre caption through their Layers' own producers).
 *
 * The scene bodies render true-scale in the foreground/HDR passes, so at
 * almost every zoom level they are sub-pixel and impossible to locate by
 * eye. These labels anchor a name to each body's world position, giving
 * the descent toward the solar system something to aim at.
 *
 * Sourced from the seed set (`SCENE_EARTH` + `SCENE_PLANETS` +
 * `SCENE_MESH_BODIES`), each tinted by its own authored colour: a planet's or
 * mesh body's `albedo`, and a fixed tint for Earth, which carries a texture
 * instead of a colour. Deriving the tints from the body records keeps this
 * file free of a parallel colour table that would drift from the seeds.
 *
 * ### Why the foreground projection, not the main one
 *
 * The main camera projection is pinned at near = 0.01 Mpc.  At solar-system
 * zoom the bodies sit ~1e-13 Mpc from the camera — far inside that near
 * plane — so the normal label path (which projects with `ctx.vp`) would
 * clip them away.  `foregroundLabelsPass` instead draws these through the
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
import type { FadeBand } from '../../../@types/math/FadeBand';
import type { ForegroundCaption } from './foregroundCaption';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { ANCHORED_MESH_BODY_IDS } from '../../../data/bodies/anchoredMeshBodyIds';
import { scaleToUnitMax } from '../../../utils/color/scaleToUnitMax';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';

/**
 * Earth's caption tint. `EarthBody` carries a texture rather than a colour,
 * so this is the one hand-authored tint in the set — the same Earth blue
 * the captions have always used.
 */
const EARTH_TINT: Readonly<Vec3> = [0.5, 0.72, 1];

/**
 * Turn a seed's authored reveal distance into the caption's band: alpha 0 at
 * twice it, 1 at it. The ×2 is the ONE place the band's width lives, so a seed
 * tune stays a single number.
 */
function captionRevealBand(revealM: number | undefined): FadeBand | undefined {
  if (revealM === undefined) return undefined;
  const fullAt = revealM * SCALE_UNITS.M_TO_MPC;
  return { fullAt, goneAt: 2 * fullAt };
}

/**
 * Build one name label per core seeded scene body, positioned relative to
 * `RENDER_ORIGIN_MPC` for the foreground view-projection.
 *
 * Every body reads its position from the caller's `bodyStates` snapshot (the
 * per-frame `deriveBodyStates(simDays)` map), so Earth's and the planets'
 * captions FOLLOW them as the sim clock advances. The caller re-invokes this only
 * when the snapshot actually changes — a paused clock returns the same map by
 * reference, so a fresh instant is the only thing that rebuilds the captions
 * (see `foregroundLabelsPass`'s memo).
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
        planet.albedo,
        'planet',
      ),
    ),
    // A mesh body's baked `albedo` is a mean over the whole surface — dark
    // skin, or (petunias) an atlas averaging in black gaps — far below a
    // planet's, so it is scaled to full brightness first; the caption keeps
    // the hue, just not the darkness. An anchored scan is ground, not an
    // object on it, so it goes uncaptioned (and unpicked, see meshBodiesPass).
    ...SCENE_MESH_BODIES.filter((body) => !ANCHORED_MESH_BODY_IDS.has(body.id)).map((body) => ({
      ...bodyCaption(
        body,
        bodyFootprintRadiusM(body),
        bodyStates.get(body.id)!.positionMpc,
        scaleToUnitMax(body.albedo),
        'meshBody',
      ),
      revealBand: captionRevealBand(body.captionRevealM),
    })),
  ];
}
