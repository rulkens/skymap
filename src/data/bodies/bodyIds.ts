import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * BODY_IDS — the body-only id list, the tight key domain for
 * `settings.bodies.items`.
 *
 * `SOURCE_IDS` spans every registry kind, so keying a body-items record by it
 * would let a foreign id slip in. Filtering to `type === 'body'` gives a key
 * domain that admits exactly the near-field bodies — the same narrowing
 * `STAR_CATALOG_IDS` / `STRUCTURE_IDS` do for their clusters. Order is registry
 * source-code order; it is purely iteration order, since per-body state comes
 * from the keyed `items` record, not list position.
 */
export const BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => e.id);
