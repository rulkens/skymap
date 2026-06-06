import type { StructureCategory } from '../@types/engine/data/StructureCategory';

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
