/**
 * `ATTRIBUTIONS.md` is hand-written and is the one licence record. An entry is
 * a `###` heading followed by `<!-- attribution: id=…; keys=…; hosts=… -->` and
 * `- **Label:** text` bullets; this reads those back as rows, so the coverage
 * test and the site's data and credits pages use the file itself, not a copy.
 * It throws on anything it cannot read as an entry, because an entry that is
 * skipped in silence is a licence nobody checks.
 */
import type { AttributionEntry } from '../../@types/io/AttributionEntry';

const MARKER = /^<!--\s*attribution:\s*(.*?)\s*-->$/;
const BULLET = /^- \*\*(.+?):\*\*\s*(.*)$/;
const CHECKED = /^(\d{4}-\d{2}-\d{2})/;
const MARKER_NAMES = ['id', 'keys', 'hosts'];

function list(value: string | undefined): readonly string[] {
  return (value ?? '').split(',').flatMap((item) => (item.trim() ? [item.trim()] : []));
}

export function parseAttributions(markdown: string): readonly AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  for (const block of markdown.split(/^(?=#{2,3} )/m)) {
    const lines = block.split('\n');
    const heading = lines[0] ?? '';
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
    const fields: Record<string, string> = {};
    let label = '';
    for (const line of lines.slice(1)) {
      const bullet = BULLET.exec(line);
      if (bullet) {
        label = bullet[1] ?? '';
        if (label in fields)
          throw new Error(`ATTRIBUTIONS.md: second "${label}" bullet under "${heading}"`);
        fields[label] = bullet[2] ?? '';
      } else if (label && /^ {2,}\S/.test(line)) {
        fields[label] += ` ${line.trim()}`;
      } else if (line.trim() !== '') {
        label = '';
      }
    }
    entries.push({
      id: attrs.id ?? '',
      keys: list(attrs.keys),
      hosts: list(attrs.hosts),
      fields,
      checked: CHECKED.exec(fields.Checked ?? '')?.[1] ?? '',
    });
  }
  return entries;
}
