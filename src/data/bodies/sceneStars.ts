/**
 * sceneStars — the local star map: the descent's foreground stars, derived from
 * the generated seed table.
 *
 * These are data, not runtime state: constants the descent renders against once
 * the zoom reaches the local (sub-kiloparsec) neighbourhood. The rows are no
 * longer hand-authored here — they come from `famousStars.generated.ts` (baked
 * from `data/seeds/famous_stars.seed.json`, never hand-edited), and the `star`
 * maker converts each row's catalogue units (RA/Dec at so many parsecs,
 * temperature in kelvin, radius in solar radii) into the canonical Megaparsec
 * draw-space frame.
 *
 * Star positions go through `raDecDistToCartesian` (inside `star`) — the SAME
 * right-handed equatorial J2000 spherical→Cartesian conversion the galaxy build
 * pipeline uses — so the seeded neighbourhood is NOT rotated against the real
 * sky the catalogues paint. The Sun's seed carries distancePc = 0, which
 * collapses the conversion to the origin [0, 0, 0] regardless of RA/Dec — the
 * frame is heliocentric.
 */

import { star } from './makers/star';
import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import type { StarBody } from '../../@types/scene/StarBody';

/** The local star map, derived row-for-row from the generated seed table. */
export const SCENE_STARS: readonly StarBody[] = FAMOUS_STARS_GENERATED.map(star);
