import type { StructureCategory } from '../@types/engine/data/StructureCategory';
import { SOURCE_REGISTRY } from './sources';

// The registry's structure rows, in source-code (registry iteration) order —
// the one place both the category list and the pick-code map are read from.
const STRUCTURE_ENTRIES = Object.values(SOURCE_REGISTRY).filter((e) => e.type === 'structure');

/**
 * STRUCTURE_CATEGORIES — the runtime companion to StructureCategory, for
 * iterating (fade registration, settings rows, marker buckets). Order is
 * registry source-code order; it's purely iteration order, since per-category
 * visuals come from the keyed style table, not list position.
 */
export const STRUCTURE_CATEGORIES: readonly StructureCategory[] = STRUCTURE_ENTRIES.map(
  (e) => e.id,
) as readonly StructureCategory[];

/**
 * PICK_CODE_BY_CATEGORY — each category's 5-bit code, packed into the pick
 * texture when its ring is drawn. The encode-side map; decode needs no inverse,
 * since SOURCE_REGISTRY is already keyed by code (see `unpackPick`).
 */
export const PICK_CODE_BY_CATEGORY: Readonly<Record<StructureCategory, number>> =
  Object.fromEntries(STRUCTURE_ENTRIES.map((e) => [e.id, e.code])) as Record<
    StructureCategory,
    number
  >;
