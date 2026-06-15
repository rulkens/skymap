import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of structure categories (cluster / supercluster / void /
 * group) — the key domain for structure settings, fades, and marker buckets.
 * Derived from the `type: 'structure'` registry rows, so a new structure
 * category widens the union automatically. The runtime iterable companion is
 * `STRUCTURE_CATEGORIES` in `data/structure/structureCategories`.
 */
export type StructureCategory = Extract<AnyEntry, { readonly type: 'structure' }>['id'];
