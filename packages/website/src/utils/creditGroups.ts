import type { AttributionEntry } from '../../../../tools/@types/io/AttributionEntry';
import type { CreditGroup } from '../@types/CreditGroup';

const MARKER_ID = /<!--\s*attribution:[^>]*?\bid=([^;\s]+)/;

/** A bullet's own Markdown: the parser joins its lines into one, which loses a block quote. */
function bullet(block: string, label: string): string {
  const lines = block.split('\n');
  const from = lines.findIndex((line) => line.startsWith(`- **${label}:**`));
  if (from < 0) return '';
  const rest = lines.slice(from + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return [
    lines[from]!.slice(`- **${label}:**`.length),
    ...rest.slice(0, end < 0 ? rest.length : end),
  ]
    .map((line) => line.replace(/^ {2}/, ''))
    .join('\n')
    .trim();
}

/**
 * ATTRIBUTIONS.md as the credits page reads it: its `##` sections in order,
 * each with its opening paragraphs and its entries. `entries` are the parser's
 * rows of the same file, which carry neither a heading nor a section; the two
 * are joined by id, and an entry the parser does not know throws.
 */
export function creditGroups(
  markdown: string,
  entries: readonly AttributionEntry[],
): readonly CreditGroup[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [head = '', ...blocks] = section.split(/^### /m);
      const [title = '', ...intro] = head.split('\n');
      return {
        title: title.trim(),
        notes: intro
          .join('\n')
          .split(/\n{2,}/)
          .flatMap((paragraph) => (paragraph.trim() ? [paragraph.trim()] : [])),
        entries: blocks.map((block) => {
          const id = MARKER_ID.exec(block)?.[1];
          const row = entries.find((entry) => entry.id === id);
          if (!row)
            throw new Error(`ATTRIBUTIONS.md: no parsed entry for "${block.split('\n')[0]}"`);
          return {
            id: row.id,
            name: block.split('\n')[0]!.trim(),
            by: row.fields.By ?? '',
            licence: row.fields.Licence ?? '',
            asks: bullet(block, 'Attribution'),
          };
        }),
      };
    })
    .filter((group) => group.entries.length > 0);
}
