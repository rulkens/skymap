import type { AttributionUse } from '../../../../tools/@types/io/AttributionUse';

/**
 * One cell of a docs table fed from data (components/DocTable.astro): plain
 * words; `code`, or several `codes` with commas between them; `keys` drawn
 * as keys and joined by commas and a last "or";
 * words with a dimmer line (`sub`) or an example in code under them; a link
 * that opens a view in the app (`to` follows the `#`, `query` goes before);
 * a link to a page (`href`, a site path without the base), with a `sub` line
 * too; or the `Use` terms of a source (components/UseTerms.astro).
 */
export type DocCell =
  | string
  | { code: string }
  | { codes: readonly string[] }
  | { keys: readonly string[] }
  | { text: string; sub?: string; code?: string }
  | { to: string; query?: string; label: string }
  | { href: string; label: string; sub?: string }
  | { use: readonly AttributionUse[] };
