/**
 * Format an Abell/ACO cluster designation for human display.
 *
 * The catalog stores these in a terse machine form: a single-letter prefix
 * plus a number — 'A1656' for the main Abell catalog, 'S805' for the ACO
 * southern supplement.  Neither reads naturally in the InfoCard, so we expand
 * them:
 *
 *   - 'A####' → 'Abell ####'  — the canonical "Abell 1656" spelling readers
 *     recognise from the literature.
 *   - 'S####' → 'ACO S####'  — the S-supplement has no separate "Abell"
 *     numbering, so we keep the S and qualify it with the catalog name (ACO)
 *     to avoid implying it's a plain Abell number.
 *
 * Anything that doesn't match the prefix-plus-digits shape is returned
 * untouched — defensive against unexpected catalog values rather than
 * mangling them into a wrong label.
 */
export function formatAbellDesignation(abell: string): string {
  const match = /^([AS])(\d+)$/.exec(abell);
  if (!match) return abell;
  const [, prefix, number] = match;
  return prefix === 'A' ? `Abell ${number}` : `ACO S${number}`;
}
