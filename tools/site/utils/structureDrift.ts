/**
 * The ways a structure file and its built page disagree. Sections are the page's h2s and their
 * `parts` its h3s (`parts` of a part are not a level the page has, and are a problem). Each level
 * is compared as a set of normalised texts: order and repeats are not checked, so a reworded or
 * moved heading shows up as one missing and one extra.
 */
import type { PageStructure } from '../../../packages/website/src/@types/PageStructure';
import { normalizeHeading } from './normalizeHeading';

export function structureDrift(structure: PageStructure, h2s: string[], h3s: string[]): string[] {
  const problems: string[] = [];
  const named2 = structure.sections.map((s) => normalizeHeading(s.heading));
  const named3 = structure.sections.flatMap((s) =>
    (s.parts ?? []).map((part) => {
      if (part.parts?.length)
        problems.push(`"${part.heading}" has parts; the page has no h4 level`);
      return normalizeHeading(part.heading);
    }),
  );
  const compare = (tag: string, named: string[], found: string[]): void => {
    const onPage = new Set(found.map(normalizeHeading));
    const inFile = new Set(named);
    for (const text of inFile)
      if (!onPage.has(text))
        problems.push(`${tag} "${text}" is in the structure file, not on the page`);
    for (const text of onPage)
      if (!inFile.has(text))
        problems.push(`${tag} "${text}" is on the page, not in the structure file`);
  };
  compare('h2', named2, h2s);
  compare('h3', named3, h3s);
  return problems;
}
