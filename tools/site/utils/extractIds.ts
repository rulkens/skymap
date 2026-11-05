/** The `id` attributes of a built page, for `#anchor` checks. */
export function extractIds(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
}
