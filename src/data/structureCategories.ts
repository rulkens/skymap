import type { StructureCategory } from '../@types/engine/data/StructureCategory';
import { SOURCE_ENTRIES } from './sourceEntries';

// The registry's structure rows, in source-code (registry iteration) order —
// the one place both the category list and the pick-code map are read from.
const STRUCTURE_ENTRIES = SOURCE_ENTRIES.filter((e) => e.type === 'structure');

/**
 * STRUCTURE_CATEGORIES — the runtime companion to StructureCategory, for
 * iterating (fade registration, settings rows, marker buckets). Order is
 * registry source-code order; it's purely iteration order, since per-category
 * visuals come from the keyed style table, not list position.
 */
export const STRUCTURE_CATEGORIES = STRUCTURE_ENTRIES.map((e) => e.id);

/**
 * STRUCTURE_CATEGORY_CODES — each category's 5-bit code, packed into the pick
 * texture when its ring is drawn. The encode-side map; decode needs no inverse,
 * since SOURCE_REGISTRY is already keyed by code (see `unpackPick`).
 */
export const STRUCTURE_CATEGORY_CODES: Readonly<Record<StructureCategory, number>> =
  Object.fromEntries(STRUCTURE_ENTRIES.map((e) => [e.id, e.code])) as Record<
    StructureCategory,
    number
  >;

/**
 * Narrow a label-bearing category id to StructureCategory. Lets data-driven
 * callers (e.g. the label-visibility setter) route on a registry field rather
 * than a literal `=== 'famousGalaxy'` compare while keeping the type narrowed
 * for the structure-only fade handles.
 */
export function isStructureCategory(id: string): id is StructureCategory {
  return (STRUCTURE_CATEGORIES as readonly string[]).includes(id);
}
