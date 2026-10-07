import type { PagefindPage } from '../@types/PagefindPage';
import { foldText } from './foldText';

/** Text as its words alone, a space either side of each, so one string can be looked for in another word by word. */
const words = (text: string) =>
  ` ${foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/**
 * Where a search result opens: at the place on its page that holds what was
 * asked for, not at the page's top. Of the page's elements with an id, the
 * first whose text is the query, else begins with it, else holds it as whole
 * words (a glossary term, a row of the object catalogue, a heading); failing
 * those, the last one before the first matched word. Whole words, because
 * "andromeda" must open M31's row and not the star Gamma Andromedae that
 * comes earlier on the page; the query itself first, because "redshift" is a
 * term of its own after "photometric redshift".
 */
export function searchLanding(page: PagefindPage, query: string): string {
  const asked = words(query);
  const anchors = (page.anchors ?? []).map((anchor) => ({
    ...anchor,
    words: words(anchor.text ?? ''),
  }));
  const first = page.locations?.[0];
  const anchor =
    asked.trim() === ''
      ? undefined
      : (anchors.find((candidate) => candidate.words === asked) ??
        anchors.find((candidate) => candidate.words.startsWith(asked)) ??
        anchors.find((candidate) => candidate.words.includes(asked)) ??
        (first === undefined
          ? undefined
          : anchors.filter((candidate) => candidate.location <= first).at(-1)));
  return anchor ? `${page.url}#${anchor.id}` : page.url;
}
