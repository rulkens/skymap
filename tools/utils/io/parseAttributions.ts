/**
 * `ATTRIBUTIONS.md` is hand-written and is the one licence record. An entry is
 * a `###` heading followed by `<!-- attribution: id=…; keys=…; hosts=… -->` and
 * `- **Label:** text` bullets, under a `##` section that may open with notes.
 * This is the one reader of that structure: the coverage test and the site's
 * data, credits and cite pages all use its rows, so no page keeps a rule of
 * its own for where a bullet ends. It throws on anything it cannot read as an
 * entry, because an entry skipped in silence is a licence nobody checks.
 */
import type { AttributionEntry } from '../../@types/io/AttributionEntry';
import type { AttributionUse } from '../../@types/io/AttributionUse';
import { ATTRIBUTION_USES } from './attributionUses';

const MARKER = /^<!--\s*attribution:\s*(.*?)\s*-->$/;
const BULLET = /^- \*\*(.+?):\*\*\s*(.*)$/;
const CHECKED = /^(\d{4}-\d{2}-\d{2})/;
const MARKER_NAMES = ['id', 'keys', 'hosts'];

function list(value: string | undefined, by: string | RegExp = ','): readonly string[] {
  return (value ?? '').split(by).flatMap((item) => (item.trim() ? [item.trim()] : []));
}

function isUse(term: string): term is AttributionUse {
  return Object.hasOwn(ATTRIBUTION_USES, term);
}

export function parseAttributions(markdown: string): readonly AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  let section = '';
  let sectionNotes: readonly string[] = [];
  for (const block of markdown.split(/^(?=#{2,3} )/m)) {
    const lines = block.split('\n');
    const heading = lines[0] ?? '';
    if (heading.startsWith('## ')) {
      section = heading.slice(3).trim();
      sectionNotes = list(lines.slice(1).join('\n'), /\n{2,}/);
    }
    if (!heading.startsWith('### ')) continue;
    const marker = lines.map((line) => MARKER.exec(line.trim())).find(Boolean);
    if (!marker) throw new Error(`ATTRIBUTIONS.md: no attribution marker under "${heading}"`);

    const attrs: Record<string, string> = {};
    for (const pair of (marker[1] ?? '').split(';')) {
      const [name = '', value = ''] = pair.split('=').map((part) => part.trim());
      if (!MARKER_NAMES.includes(name) || name in attrs) {
        throw new Error(`ATTRIBUTIONS.md: marker attribute "${name}" under "${heading}"`);
      }
      attrs[name] = value;
    }
    // A bullet runs over its indented lines and the blank lines between them, to the next line at the margin.
    const bullets: Record<string, string> = {};
    let label = '';
    for (const line of lines.slice(1)) {
      const bullet = BULLET.exec(line);
      if (bullet) {
        label = bullet[1] ?? '';
        if (label in bullets)
          throw new Error(`ATTRIBUTIONS.md: second "${label}" bullet under "${heading}"`);
        bullets[label] = bullet[2] ?? '';
      } else if (label && (line.trim() === '' || /^ {2,}\S/.test(line))) {
        bullets[label] += `\n${line.replace(/^ {2}/, '')}`;
      } else if (line.trim() !== '') {
        label = '';
      }
    }
    const fields: Record<string, string> = {};
    for (const [name, text] of Object.entries(bullets)) {
      bullets[name] = text.trim();
      fields[name] = text.replace(/\s+/g, ' ').trim();
    }
    const use = list(fields.Use, ';');
    const unknown = use.find((term) => !isUse(term));
    if (unknown !== undefined)
      throw new Error(`ATTRIBUTIONS.md: unknown Use term "${unknown}" under "${heading}"`);
    entries.push({
      id: attrs.id ?? '',
      heading: heading.slice(4).trim(),
      section,
      sectionNotes,
      use: use.filter(isUse),
      keys: list(attrs.keys),
      hosts: list(attrs.hosts),
      bullets,
      fields,
      checked: CHECKED.exec(fields.Checked ?? '')?.[1] ?? '',
    });
  }
  return entries;
}
