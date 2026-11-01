/**
 * A YAML text with its top-level `job:` line set, and no other line changed. The value is written
 * JSON-quoted, so a colon or a quote in it stays one string. Throws on a text with no `job:` (both
 * kinds of file require one), and on a `job:` whose value runs over more lines, which a one-line
 * write would leave half-replaced. Indented `job:` keys (the sections') are never touched.
 */
export function setStructureJob(source: string, job: string): string {
  const lines = source.split('\n');
  const at = lines.findIndex((line) => /^job:/.test(line));
  if (at === -1) throw new Error('No job line');
  const next = lines[at + 1];
  if (/^job:\s*[|>]/.test(lines[at]!) || (next !== undefined && /^\s+\S/.test(next)))
    throw new Error('The job runs over several lines');
  lines[at] = `job: ${JSON.stringify(job)}`;
  return lines.join('\n');
}
