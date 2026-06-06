import type { StructureCategory } from '../@types/engine/data/StructureCategory';
import { SOURCE_REGISTRY } from './sources';

/**
 * STRUCTURE_CATEGORIES — the canonical ordered list of the four extended-
 * structure categories (cluster / supercluster / void / group). The single
 * runtime source of truth: per-category fade-handle registration, settings
 * iteration, and the marker renderer's bucket order all derive from this list
 * rather than re-inlining the literal. Order matches the warm→cool scale
 * ladder used in the SettingsPanel and style table.
 */
export const STRUCTURE_CATEGORIES: readonly StructureCategory[] = [
  'cluster',
  'supercluster',
  'void',
  'group',
];

/**
 * SOURCE_CODE_BY_CATEGORY — each structure category's 5-bit Source code, the
 * forward half of the category↔code bridge. Derived from the registry's
 * `type: 'structure'` rows (id → code) rather than hand-listed, so it can't
 * drift from the codes themselves. Sound by construction: StructureCategory
 * *is* the set of structure-row ids, so every key is present exactly once.
 */
export const SOURCE_CODE_BY_CATEGORY: Readonly<Record<StructureCategory, number>> =
  Object.fromEntries(
    Object.values(SOURCE_REGISTRY)
      .filter((e) => e.type === 'structure')
      .map((e) => [e.id, e.code]),
  ) as Record<StructureCategory, number>;
