/**
 * One page of a Pagefind result, as much of it as the search lists. `excerpt`
 * is HTML: escaped text with the matched words in `<mark>`. `anchors` are the
 * page's elements that have an id, each with the count of words before it;
 * `locations` are the same counts for the matched words.
 */
export type PagefindPage = {
  url: string;
  excerpt: string;
  meta: { title?: string; group?: string };
  anchors?: { id: string; text?: string; location: number }[];
  locations?: number[];
};
