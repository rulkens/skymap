import type { StructureCategory } from '../@types/engine/data/StructureCategory';
import { SOURCE_REGISTRY } from './sources';

// The registry's structure rows, in source-code (registry iteration) order —
// the one place both the category list and the pick-code map are read from.
const STRUCTURE_ENTRIES = Object.values(SOURCE_REGISTRY).filter((e) => e.type === 'structure');

/**
 * STRUCTURE_CATEGORIES — the extended-structure categories (cluster /
 * supercluster / void / group), the runtime companion to the StructureCategory
 * type. Derived from the registry's `type: 'structure'` rows rather than
 * hand-listed, so it can't drift from the type. Consumers iterate it for
 * per-category fade registration, settings rows, and the marker renderer's
 * buckets. Order follows the registry (source-code order) — purely iteration
 * order, since per-category visuals come from the keyed style table, not from
 * list position.
 */
export const STRUCTURE_CATEGORIES: readonly StructureCategory[] = STRUCTURE_ENTRIES.map(
  (e) => e.id,
) as readonly StructureCategory[];

/**
 * PICK_CODE_BY_CATEGORY — each structure category's 5-bit code, packed into the
 * pick texture's upper bits when its ring is drawn. Derived from the registry's
 * structure rows (id → code), so it can't drift from the codes themselves.
 * Sound by construction: StructureCategory *is* the set of structure-row ids,
 * so every key is present exactly once. (The decode direction needs no
 * companion map — SOURCE_REGISTRY is keyed by code, so `unpackPick` reads
 * code→entry straight off it.)
 */
export const PICK_CODE_BY_CATEGORY: Readonly<Record<StructureCategory, number>> =
  Object.fromEntries(STRUCTURE_ENTRIES.map((e) => [e.id, e.code])) as Record<
    StructureCategory,
    number
  >;
