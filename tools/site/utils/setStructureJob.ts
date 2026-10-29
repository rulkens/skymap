/**
 * A structure file's text with its top-level `job:` line set, and no other line changed. The value
 * is written JSON-quoted, so a colon or a quote in it stays one string. A file with no `job:` gets
 * the line first. Throws on a `job:` whose value runs over more lines, which a one-line write would
 * leave half-replaced. Indented `job:` keys (the sections') are never touched.
 */
export function setStructureJob(source: string, job: string): string {
  const lines = source.split('\n');
  const at = lines.findIndex((line) => /^job:/.test(line));
  const next = lines[at + 1];
  if (at !== -1 && (/^job:\s*[|>]/.test(lines[at]!) || (next !== undefined && /^\s+\S/.test(next))))
    throw new Error('The job runs over several lines');
  const line = `job: ${JSON.stringify(job)}`;
  if (at === -1) lines.unshift(line);
  else lines[at] = line;
  return lines.join('\n');
}
