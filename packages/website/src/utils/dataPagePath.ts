/**
 * The site path of one source's data page, by its entry id in ATTRIBUTIONS.md.
 * The one place the scheme is written: the data pages are built at it and the
 * credits and cite pages link to it.
 */
export function dataPagePath(id: string): string {
  return `/docs/data/${id}/`;
}
