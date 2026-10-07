/**
 * One cell of a docs table fed from data (components/DocTable.astro): plain
 * words; `code` in the mono face; `keys` drawn as keys, each a chord as the
 * `Keys` component takes it, joined by commas and a last "or"; words with a
 * dimmer line (`sub`) or an example in code under them; a link that opens a
 * view in the app (`to` is what follows the `#`, `query` a flag before it);
 * or a link to a page (`href`, a site path without the base, or an address).
 */
export type DocCell =
  | string
  | { code: string }
  | { keys: readonly string[] }
  | { text: string; sub?: string; code?: string }
  | { to: string; query?: string; label: string }
  | { href: string; label: string };
