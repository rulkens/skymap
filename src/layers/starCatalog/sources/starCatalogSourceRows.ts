/**
 * The Layer's `sources` field, in `Stars` panel order: the survey bin first,
 * then the three seeded catalogs. Listed explicitly, not derived from
 * `Source`, so a new enum code isn't silently promoted into the panel.
 */

import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { Source } from '../../../data/source';
import { GAIA_STARS_ENTRY } from './gaia-stars';
import { FAMOUS_STAR_ENTRY } from './famous-star';
import { SUN_ENTRY } from './sun';
import { S_STAR_ENTRY } from './s-star';

export const STAR_CATALOG_SOURCE_ROWS = [
  [Source.GaiaStars, GAIA_STARS_ENTRY],
  [Source.FamousStar, FAMOUS_STAR_ENTRY],
  [Source.Sun, SUN_ENTRY],
  [Source.SStar, S_STAR_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
