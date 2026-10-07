import type { PagefindPage } from '../@types/PagefindPage';
import { foldText } from './foldText';

/** Text as its words alone, a space either side of each, so one string can be looked for in another word by word. */
const words = (text: string) =>
  ` ${foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/**
 * Where a search result opens: at the top of its page, unless one element
 * with an id names what was asked for (a glossary term, a row of the object
 * catalogue, a heading) and the page's own title does not. Of those elements,
 * the first whose text is the query, else begins with it, else holds it as
 * whole words. Whole words, because "andromeda" must open M31's row and not
 * the star Gamma Andromedae that comes earlier on the page; the query itself
 * first, because "redshift" is a term of its own after "photometric
 * redshift". Words found only in a page's running text open the page, not
 * the heading that happens to stand before them.
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
