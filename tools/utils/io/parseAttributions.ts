/**
 * `ATTRIBUTIONS.md` is hand-written and is the one licence record. An entry is
 * a `###` heading followed by `<!-- attribution: id=…; keys=…; hosts=… -->` and
 * `- **Label:** text` bullets; this reads those back as rows, so the coverage
 * test and the site's data and credits pages use the file itself, not a copy.
 */
import type { AttributionEntry } from '../../@types/io/AttributionEntry';

const MARKER = /^<!--\s*attribution:\s*(.*?)\s*-->$/;
const BULLET = /^- \*\*(.+?):\*\*\s*(.*)$/;
const CHECKED = /^(\d{4}-\d{2}-\d{2})/;

function list(value: string | undefined): readonly string[] {
  return (value ?? '').split(',').flatMap((item) => (item.trim() ? [item.trim()] : []));
}

export function parseAttributions(markdown: string): readonly AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  let section = '';
  for (const block of markdown.split(/^(?=#{2,3} )/m)) {
    const lines = block.split('\n');
    const heading = lines[0] ?? '';
    if (heading.startsWith('## ')) section = heading.slice(3).trim();
    const marker = lines.map((line) => MARKER.exec(line.trim())).find(Boolean);
    if (!heading.startsWith('### ') || !marker) continue;

    const attrs = Object.fromEntries(
      (marker[1] ?? '').split(';').map((pair) => {
        const [name = '', value = ''] = pair.split('=');
        return [name.trim(), value.trim()];
      }),
    );
    const fields: Record<string, string> = {};
    let label = '';
    for (const line of lines.slice(1)) {
      const bullet = BULLET.exec(line);
      if (bullet) {
        label = bullet[1] ?? '';
        fields[label] = bullet[2] ?? '';
      } else if (label && /^ {2,}\S/.test(line)) {
        fields[label] += ` ${line.trim()}`;
      } else if (line.trim() !== '') {
        label = '';
      }
    }
    const checked = fields.Checked ?? '';
    entries.push({
      id: attrs.id ?? '',
      title: heading.slice(4).trim(),
      section,
      keys: list(attrs.keys),
      hosts: list(attrs.hosts),
      fields,
      checked: CHECKED.exec(checked)?.[1] ?? '',
      checkedUrls: checked.match(/https?:\/\/[^\s<>,)]+/g) ?? [],
    });
  }
  return entries;
}
