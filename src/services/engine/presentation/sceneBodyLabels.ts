/**
 * sceneBodyLabels — name captions for the true-scale foreground bodies core
 * still owns: Earth, the planets, Sgr A*, and the mesh bodies (the seeded
 * stars and the Sun caption through the star Layer's own producer now).
 *
 * The scene bodies render true-scale in the foreground/HDR passes, so at
 * almost every zoom level they are sub-pixel and impossible to locate by
 * eye. These labels anchor a name to each body's world position, giving
 * the descent toward the solar system something to aim at.
 *
 * Sourced from the seed set (`SCENE_EARTH` + `SCENE_PLANETS` + `SGR_A_STAR` +
 * `SCENE_MESH_BODIES`), each tinted by its own authored colour: a planet's or
 * mesh body's `albedo`, and fixed tints for the two records that carry no
 * colour (Earth, which has a texture instead, and Sgr A*, which has no
 * light). Deriving the tints from the body records keeps this file free of a
 * parallel colour table that would drift from the seeds.
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
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { scaleToUnitMax } from '../../../utils/color/scaleToUnitMax';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { bodyCaption } from '../../../utils/labels/bodyCaption';

/**
 * Earth's caption tint. `EarthBody` carries a texture rather than a colour,
 * so this is the one hand-authored tint in the set — the same Earth blue
 * the captions have always used.
 */
const EARTH_TINT: Readonly<Vec3> = [0.5, 0.72, 1];

/**
 * Sgr A*'s caption tint. An `AnchorPointBody` carries no photometry — there is
 * no light to take a colour from — so this is authored: a warm accretion amber,
 * distinct from every blue-to-white star tint so the Galactic Centre reads as a
 * landmark rather than one more name in the star map.
 */
const SGR_A_STAR_TINT: Readonly<Vec3> = [1, 0.66, 0.32];

/**
 * The one place the scene-body caption id format lives. `bodyCaption` (which
 * stamps each caption) derives from it, so a consumer that must recognise a
 * caption by body id never re-hardcodes the `sceneBody-` prefix.
 */
export function sceneBodyLabelId(bodyId: string): string {
  return `sceneBody-${bodyId}`;
}

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
 * captions FOLLOW them as the sim clock advances; Sgr A*'s anchor is fixed, so
 * its caption sits still at every instant. The caller re-invokes this only
 * when the snapshot actually changes — a paused clock returns the same map by
 * reference, so a fresh instant is the only thing that rebuilds the captions
 * (see `foregroundLabelsPass`'s memo).
 */
export function sceneBodyLabels(bodyStates: ReadonlyMap<string, BodyState>): ForegroundCaption[] {
  return [
    bodyCaption(SCENE_EARTH, bodyStates.get(SCENE_EARTH.id)!.positionMpc, EARTH_TINT, 'earth'),
    ...SCENE_PLANETS.map((planet) =>
      bodyCaption(planet, bodyStates.get(planet.id)!.positionMpc, planet.albedo, 'planet'),
    ),
    // Sgr A* draws no geometry, so this caption is its ENTIRE on-screen
    // presence: omitted here it is invisible with nothing to diagnose, which is
    // why it is emitted from the seed record rather than from a drawn set.
    bodyCaption(
      SGR_A_STAR,
      bodyStates.get(SGR_A_STAR.id)!.positionMpc,
      SGR_A_STAR_TINT,
      'sgrAStar',
    ),
    // A mesh body's baked `albedo` is a mean over the whole surface — dark
    // skin, or (petunias) an atlas averaging in black gaps — far below a
    // planet's, so it is scaled to full brightness first; the caption keeps
    // the hue, just not the darkness.
    ...SCENE_MESH_BODIES.map((body) => ({
      ...bodyCaption(
        body,
        bodyStates.get(body.id)!.positionMpc,
        scaleToUnitMax(body.albedo),
        'meshBody',
      ),
      revealBand: captionRevealBand(body.captionRevealM),
    })),
  ];
}
