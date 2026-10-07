import type { AttributionRecord } from '../@types/AttributionRecord';

const MARKER_ID = /^<!--\s*attribution:\s*id=([^;\s]+)/;
const BULLET = /^- \*\*(.+?):\*\*\s*(.*)$/;
/** A paragraph that names a term for the entries to use: `referred to as "the CDS terms"`. */
const NAMES_A_TERM = /referred to (?:below )?as "([^"]+)"/;

/**
 * `ATTRIBUTIONS.md` as a data page prints it: each entry's heading, its
 * section and its bullets with their paragraphs, block quotes and inner lists
 * kept (`parseAttributions` joins a bullet into one line, which is right for a
 * check and loses the shape a page needs). A section's opening paragraphs are
 * its notes; one that names a term for the entries to use is listed under
 * `terms`, so that a page can print the text an entry points at with the
 * words "quoted above".
 */
export function attributionRecords(markdown: string): {
  readonly records: readonly AttributionRecord[];
  readonly terms: readonly { readonly term: string; readonly text: string }[];
} {
  const records: AttributionRecord[] = [];
  const terms: { term: string; text: string }[] = [];
  for (const part of markdown.split(/^## /m).slice(1)) {
    const [head = '', ...blocks] = part.split(/^### /m);
    const [title = '', ...opening] = head.split('\n');
    const paragraphs = opening
      .join('\n')
      .split(/\n{2,}/)
      .flatMap((paragraph) => (paragraph.trim() ? [paragraph.replace(/\s+/g, ' ').trim()] : []));
    const notes = paragraphs.filter((paragraph) => !NAMES_A_TERM.test(paragraph));
    for (const paragraph of paragraphs) {
      const term = NAMES_A_TERM.exec(paragraph)?.[1];
      if (term) terms.push({ term, text: paragraph });
    }
    for (const block of blocks) {
      const [heading = '', ...lines] = block.split('\n');
      const id = lines.map((line) => MARKER_ID.exec(line.trim())?.[1]).find(Boolean);
      if (!id) continue;
      const bullets: Record<string, string> = {};
      let label = '';
      for (const line of lines) {
        const bullet = BULLET.exec(line);
        if (bullet) {
          label = bullet[1]!;
          bullets[label] = bullet[2]!;
        } else if (label && (line.trim() === '' || /^ {2,}\S/.test(line))) {
          bullets[label] += `\n${line.replace(/^ {2}/, '')}`;
        } else if (line.trim() !== '') {
          label = '';
        }
      }
      for (const key of Object.keys(bullets)) bullets[key] = bullets[key]!.trim();
      records.push({ id, heading: heading.trim(), section: title.trim(), notes, bullets });
    }
  }
  return { records, terms };
}
