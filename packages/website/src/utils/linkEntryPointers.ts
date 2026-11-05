/**
 * The licence record points from one entry to another as `(see entry: gaia)`,
 * sometimes across a line break: here it becomes a Markdown link to that
 * entry, whose address and title `to` gives (or throws, for an unknown id).
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
