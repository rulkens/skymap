/**
 * BODY_SEARCH_NAMES — the one per-body search-name lookup: the names the palette
 * scores a query against, and the aliases a row shows in its secondary slot.
 *
 * One map over every seeded star table's `names[]`; `names[0]` is the display
 * label. The craft's names live in the missions Layer (`CRAFT_SEARCH_NAMES`).
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { SUN_GENERATED } from './sun.generated';

export const BODY_SEARCH_NAMES: ReadonlyMap<string, readonly string[]> = new Map([
  ...FAMOUS_STARS_GENERATED.map((row) => [row.id, row.names] as const),
  ...SUN_GENERATED.map((row) => [row.id, row.names] as const),
]);
