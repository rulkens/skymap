import type { StructureId } from '../../@types/data/structure/StructureId';
import { SOURCE_ENTRIES } from '../sourceEntries';

// The registry's structure rows, in source-code (registry iteration) order —
// the one place both the id list and the pick-code map are read from.
const STRUCTURE_ENTRIES = SOURCE_ENTRIES.filter((e) => e.type === 'structure');

/**
 * STRUCTURE_IDS — the runtime companion to StructureId, for iterating (fade
 * registration, settings rows, marker buckets). Order is registry source-code
 * order; it's purely iteration order, since per-id visuals come from the keyed
 * style table, not list position.
 */
export const STRUCTURE_IDS = STRUCTURE_ENTRIES.map((e) => e.id);

/**
 * STRUCTURE_ID_CODES — each structure id's 6-bit code, packed into the pick
 * texture when its ring is drawn. The encode-side map; decode needs no inverse,
 * since SOURCE_REGISTRY is already keyed by code (see `unpackPick`).
 */
export const STRUCTURE_ID_CODES: Readonly<Record<StructureId, number>> = Object.fromEntries(
  STRUCTURE_ENTRIES.map((e) => [e.id, e.code]),
) as Record<StructureId, number>;

/**
 * Narrow a label-bearing id to StructureId. Lets data-driven callers (e.g. the
 * label-visibility setter) route on a registry field rather than a literal
 * `=== 'famousGalaxy'` compare while keeping the type narrowed for the
 * structure-only fade handles.
 */
export function isStructureId(id: string): id is StructureId {
  return (STRUCTURE_IDS as readonly string[]).includes(id);
}
