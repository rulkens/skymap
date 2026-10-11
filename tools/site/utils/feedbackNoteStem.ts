/**
 * The shared file stem of a note (`<ISO time>-<page slug>-<n>`), so a note's
 * JSON and any sibling file sort by time and name their page. Colons and
 * milliseconds are dropped from the time: colons are illegal in some file
 * systems and the sequence number already separates notes in the same second.
 */
export function feedbackNoteStem(timestamp: string, pagePath: string, n: number): string {
  const time = timestamp.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  const slug = pagePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${time}-${slug || 'index'}-${n}`;
}
