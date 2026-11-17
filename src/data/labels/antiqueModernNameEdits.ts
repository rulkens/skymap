/**
 * ANTIQUE_MODERN_NAME_EDITS — how the antique look Latinises a modern name it
 * must keep (the focused or selected subject, which `ANTIQUE_LABEL_RULES` does
 * not rename), applied in order: catalog numbers in brackets go, English words
 * with a period equivalent turn Latin, a class word the name does not need goes,
 * a post-1690 name yields to its catalogue number.
 * The modern name stays in the info card and search.
 */

export const ANTIQUE_MODERN_NAME_EDITS: readonly (readonly [RegExp, string])[] = [
  [/\s*\([^)]*\)/g, ''],
  [/Galactic Centre/g, 'Centrum Galaxiae'],
  [/\s*Supercluster/g, ''],
  // A galaxy named after the plate takes its catalogue number, the modern name glossed
  // (owner ruling 2026-11-08, M51 first).
  [/^Whirlpool Galaxy$/, 'Messier 51\n(Whirlpool Galaxy)'],
];
