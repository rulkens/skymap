/**
 * BODY_SEARCH_NAMES — the one per-body search-name lookup: the names the palette
 * scores a query against, and the aliases a row shows in its secondary slot.
 *
 * One map over every seeded star table's `names[]` plus an authored table for
 * bodies with no seed row at all. `names[0]` is the display label.
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { SUN_GENERATED } from './sun.generated';

const AUTHORED: readonly (readonly [string, readonly string[]])[] = [
  // Petunias' aliases are what a reader who knows the joke will actually type;
  // the whale needs none — its label alone already scores the match.
  ['petunias', ['petunias', 'bowl of petunias', 'oh no not again']],
  // Mission designations and nicknames: what a reader types is rarely the label.
  ['voyager1', ['Voyager 1', 'Voyager']],
  ['voyager2', ['Voyager 2', 'Voyager']],
  ['hubble', ['Hubble', 'HST', 'Hubble Space Telescope']],
  ['curiosity', ['Curiosity', 'MSL', 'Mars Science Laboratory']],
  ['perseverance', ['Perseverance', 'Percy', 'Mars 2020']],
  ['spirit', ['Spirit', 'MER-A']],
  ['opportunity', ['Opportunity', 'Oppy', 'MER-B']],
];

export const BODY_SEARCH_NAMES: ReadonlyMap<string, readonly string[]> = new Map([
  ...FAMOUS_STARS_GENERATED.map((row) => [row.id, row.names] as const),
  ...SUN_GENERATED.map((row) => [row.id, row.names] as const),
  ...AUTHORED,
]);
