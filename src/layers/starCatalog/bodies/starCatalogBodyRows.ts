/**
 * starCatalogBodyRows — the seeded stars as body rows: the Sun and the famous stars are anchors
 * (roots of the focus graph), the S-stars orbit the Galactic Centre. Each row reuses the
 * `SEEDED_STAR_CATALOGS` record, so the registry and the pick tables hold the same objects.
 *
 * Anchors convert catalogue RA/Dec at so many parsecs with the galaxy pipeline's own equatorial
 * J2000 conversion, so the neighbourhood is not rotated against the sky the catalogues paint.
 * The Sun's `[0, 0, 0]` comes from its seed row (distance 0), not `RENDER_ORIGIN_MPC`: the two
 * share a value only because the origin was chosen to be the Sun.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import type { FamousStarRow } from '../@types/FamousStarRow';
import type { StarBody } from '../../../@types/scene/StarBody';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { SUN_GENERATED } from './sun.generated';
import { SCENE_STARS } from './sceneStars';
import { SCENE_SUN } from './sceneSun';
import { SCENE_S_STARS } from './sceneSStars';
import { S_STAR_ORBITAL_ELEMENTS } from './sStarOrbitalElements';
import { raDecDistToCartesian } from '../../../utils/math/raDecDistToCartesian';

// Each table is derived row for row from the same seed array, so index i pairs them.
const anchorRows = (bodies: readonly StarBody[], rows: readonly FamousStarRow[]): LayerBody[] =>
  rows.map((row, i) => ({
    body: bodies[i]!,
    position: {
      kind: 'anchor',
      positionMpc: raDecDistToCartesian(
        row.raDeg,
        row.decDeg,
        row.distancePc * SCALE_UNITS.PC_TO_MPC,
      ),
    },
  }));

/** Sun, then the famous stars, then the S-stars: the order `SCENE_ANCHORS` had. */
export const STAR_CATALOG_BODY_ROWS: readonly LayerBody[] = [
  ...anchorRows(SCENE_SUN, SUN_GENERATED),
  ...anchorRows(SCENE_STARS, FAMOUS_STARS_GENERATED),
  ...SCENE_S_STARS.map(
    (body, i): LayerBody => ({
      body,
      position: { kind: 'orbit', elements: S_STAR_ORBITAL_ELEMENTS[i]! },
    }),
  ),
];
