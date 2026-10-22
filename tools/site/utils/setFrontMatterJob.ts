/**
 * A page's text with its front matter's `job:` line set, and no other line changed. The value is
 * written JSON-quoted, so a colon or a quote in it stays one string. A page with no `job:` gets the
 * line last in the block. Throws on a text with no front matter, and on a `job:` whose value runs
 * over more lines, which a one-line write would leave half-replaced.
 */
export function setFrontMatterJob(source: string, job: string): string {
  const end = source.startsWith('---\n') ? source.indexOf('\n---', 3) : -1;
  if (end === -1) throw new Error('No front matter');
  const block = end > 4 ? source.slice(4, end) : '';
  const lines = block === '' ? [] : block.split('\n');
  const at = lines.findIndex((line) => /^job:/.test(line));
  const next = lines[at + 1];
  if (at !== -1 && (/^job:\s*[|>]/.test(lines[at]!) || (next !== undefined && /^\s/.test(next))))
    throw new Error('The job runs over several lines');
  const line = `job: ${JSON.stringify(job)}`;
  if (at === -1) lines.push(line);
  else lines[at] = line;
  return `---\n${lines.join('\n')}${source.slice(end)}`;
}
