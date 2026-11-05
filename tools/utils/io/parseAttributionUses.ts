import type { AttributionUse } from '../../@types/io/AttributionUse';
import { ATTRIBUTION_USES } from './attributionUses';

/**
 * The one-line meaning of each `Use` term, read from the list that defines
 * them at the head of `ATTRIBUTIONS.md` (`` - `Term`: meaning ``), so a page
 * that explains a term prints the record's own definition. A term of the
 * vocabulary with no definition there throws.
 */
export function parseAttributionUses(markdown: string): Readonly<Record<AttributionUse, string>> {
  const defined = new Map<string, string>();
  for (const item of markdown.matchAll(/^ {2}- `([^`]+)`: ((?:.|\n {4})+)/gm))
    defined.set(item[1]!, item[2]!.replace(/\s+/g, ' ').trim());
  const meaning = (term: string): string => {
    const text = defined.get(term);
    if (!text) throw new Error(`ATTRIBUTIONS.md: no definition of the Use term "${term}"`);
    return text;
  };
  return Object.fromEntries(
    Object.keys(ATTRIBUTION_USES).map((term) => [term, meaning(term)]),
  ) as Record<AttributionUse, string>;
}
