import { SOURCE_ENTRIES } from './sourceEntries';

/**
 * SURVEY_IDS — the survey-only id list, the tight key domain for
 * `settings.surveys.items`.
 *
 * `SOURCE_IDS` spans every registry kind (surveys, structures, filaments,
 * volumes), so keying a survey-items record by it would let a structure or
 * volume id slip in. Filtering to `type === 'survey'` here gives a key domain
 * that admits exactly the point-layer sources — the same narrowing
 * `STRUCTURE_CATEGORIES` does for the structure clusters. Order is registry
 * source-code order; it's purely iteration order, since per-survey state comes
 * from the keyed `items` record, not list position.
 */
export const SURVEY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'survey').map((e) => e.id);
