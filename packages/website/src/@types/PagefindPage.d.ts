/** One page of a Pagefind result, as much of it as the search lists. `excerpt` is HTML: escaped text with the matched words in `<mark>`. */
export type PagefindPage = {
  url: string;
  excerpt: string;
  meta: { title?: string; group?: string };
};
