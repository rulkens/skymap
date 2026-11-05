import type { PagefindPage } from '../@types/PagefindPage';
import { foldText } from './foldText';

/** Text as its words alone, a space either side of each, so one string can be looked for in another word by word. */
const words = (text: string) =>
  ` ${foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/**
 * Where a search result opens: the top of its page, unless an element with an
 * id (a glossary term, a catalogue row, a heading) names what was asked for
 * and the page's title does not. The element that is the query wins over one
 * that begins with it ("redshift" after "photometric redshift"), and that over
 * one that holds it as whole words ("andromeda" is M31, not Gamma Andromedae).
 * Words found only in running text open the page.
 */
export function searchLanding(page: PagefindPage, query: string): string {
  const asked = words(query);
  // The title by the beginnings of its words: "tour" is a page-level match of "Tours and exhibits".
  if (asked.trim() === '' || words(page.meta.title ?? '').includes(asked.trimEnd()))
    return page.url;
  const anchors = (page.anchors ?? []).map((anchor) => ({
    id: anchor.id,
    words: words(anchor.text ?? ''),
  }));
  const anchor =
    anchors.find((candidate) => candidate.words === asked) ??
    anchors.find((candidate) => candidate.words.startsWith(asked)) ??
    anchors.find((candidate) => candidate.words.includes(asked));
  return anchor ? `${page.url}#${anchor.id}` : page.url;
}
