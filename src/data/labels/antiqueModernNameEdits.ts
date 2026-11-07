/**
 * ANTIQUE_MODERN_NAME_EDITS — how the antique look Latinises a modern name it
 * must keep (the focused or selected subject, which `ANTIQUE_LABEL_RULES` does
 * not rename), applied in order: catalog numbers in brackets go, English words
 * with a period equivalent turn Latin, a class word the name does not need goes.
 * The modern name stays in the info card and search.
 */

export const ANTIQUE_MODERN_NAME_EDITS: readonly (readonly [RegExp, string])[] = [
  [/\s*\([^)]*\)/g, ''],
  [/Galactic Centre/g, 'Centrum Galaxiae'],
  [/\s*Supercluster/g, ''],
];
