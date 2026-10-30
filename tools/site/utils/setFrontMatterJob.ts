import { setStructureJob } from './setStructureJob';

/**
 * A page's text with its front matter's `job:` line set (see setStructureJob for the line rules)
 * and the body untouched. Throws on a text with no front matter.
 */
export function setFrontMatterJob(source: string, job: string): string {
  const end = source.startsWith('---\n') ? source.indexOf('\n---', 3) : -1;
  if (end === -1) throw new Error('No front matter');
  return `---\n${setStructureJob(source.slice(4, end), job)}${source.slice(end)}`;
}
