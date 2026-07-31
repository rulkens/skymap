/**
 * BODY_SEARCH_NAMES — the one per-body search-name lookup: the names the palette
 * scores a query against, and the aliases a row shows in its secondary slot.
 *
 * Two contributors, one map: every generated famous-star row's `names[]`, plus
 * an authored table for bodies that have no famous-star row. `names[0]` is the
 * display label. Authoring here rather than in `famous_stars.seed.json` is
 * load-bearing — a seed row would make its body a DRAWN famous star and a
 * `solar-neighbourhood` member, which for Sgr A* would take that region's
 * extent to 8 kpc and drag the NEAR0 far plane with it.
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { SGR_A_STAR_ENTRY } from '../sources/sgr-a-star';

// "Galactic Centre" is deliberately absent: it names a place rather than this
// body, and is claimed by the galactic-centre place-labels backlog item.
const AUTHORED: readonly (readonly [string, readonly string[]])[] = [
  [SGR_A_STAR_ENTRY.id, [SGR_A_STAR_ENTRY.label, 'Sagittarius A*', 'SgrA*']],
];

export const BODY_SEARCH_NAMES: ReadonlyMap<string, readonly string[]> = new Map([
  ...FAMOUS_STARS_GENERATED.map((row) => [row.id, row.names] as const),
  ...AUTHORED,
]);
