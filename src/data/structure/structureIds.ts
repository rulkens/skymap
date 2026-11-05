import { SOURCE_ENTRIES } from '../sourceEntries';

// The registry's structure rows, in source-code (registry iteration) order.
const STRUCTURE_ENTRIES = SOURCE_ENTRIES.filter((e) => e.type === 'structure');

/**
 * STRUCTURE_IDS — the runtime companion to StructureId, for iterating (fade
 * registration, settings rows, marker buckets). Order is registry source-code
 * order; it's purely iteration order, since per-id visuals come from the keyed
 * style table, not list position.
 */
export const STRUCTURE_IDS = STRUCTURE_ENTRIES.map((e) => e.id);
