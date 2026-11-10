/** A stream's deep-link focus id, the one spelling the URL, the palette and the row share. */
export function encodeStellarStreamFocusId(slug: string): string {
  return `stream-${slug}`;
}
