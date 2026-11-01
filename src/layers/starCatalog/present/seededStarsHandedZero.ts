/**
 * seededStarsHandedZero — whether every seeded star set hands 0, so no seeded star can
 * draw. Core skips a pass only when EVERY item is 0, and the survey item stays above 0
 * far past the seeded sets' bands, so the seeded passes ask this themselves.
 */

import type { FadeValueOf } from '../../../@types/animation/FadeValueOf';
import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';
import { SEEDED_STAR_CATALOGS } from '../../../data/bodies/seededStarCatalogs';

const SEEDED_ITEMS = Object.keys(SEEDED_STAR_CATALOGS) as SeededStarCatalogId[];

export function seededStarsHandedZero(fade: FadeValueOf<'starCatalog'>): boolean {
  return SEEDED_ITEMS.every((item) => fade[item] === 0);
}
