/**
 * The licence record points from one entry to another as `(see entry: gaia)`,
 * sometimes across a line break. On a page that becomes a Markdown link to
 * the other entry by its title; `to` gives both, and throws on an id the
 * record does not have, so a pointer cannot lead nowhere.
 */
export function linkEntryPointers(
  markdown: string,
  to: (id: string) => { readonly href: string; readonly title: string },
): string {
  return markdown.replace(/\(see\s+entry:\s+([a-z0-9-]+)\)/g, (_, id: string) => {
    const { href, title } = to(id);
    return `(see [${title}](${href}))`;
  });
}
