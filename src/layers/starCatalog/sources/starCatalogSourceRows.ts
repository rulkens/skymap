/**
 * The Layer's `sources` field, in `Stars` panel order: the survey bin first,
 * then the three seeded catalogs. Listed explicitly, so a new
 * entry isn't silently promoted into the panel.
 */

import type { SourceEntry } from '../../../@types/data/SourceEntry';

import { GAIA_STARS_ENTRY } from './gaia-stars';
import { FAMOUS_STAR_ENTRY } from './famous-star';
import { SUN_ENTRY } from './sun';
import { S_STAR_ENTRY } from './s-star';

export const STAR_CATALOG_SOURCE_ROWS = [
  GAIA_STARS_ENTRY,
  FAMOUS_STAR_ENTRY,
  SUN_ENTRY,
  S_STAR_ENTRY,
] as const satisfies readonly SourceEntry[];
