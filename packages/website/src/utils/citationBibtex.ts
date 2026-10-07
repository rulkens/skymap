import type { SoftwareCitation } from '../@types/SoftwareCitation';

/** The software citation as a BibTeX entry. `url` is the repository's address. */
export function citationBibtex(citation: SoftwareCitation, url: string): string {
  const authors = citation.authors
    .map((author) => `${author.family}, ${author.given}`)
    .join(' and ');
  return `@software{skymap,
  author  = {${authors}},
  title   = {${citation.title}},
  version = {${citation.version}},
  year    = {${citation.released.slice(0, 4)}},
  doi     = {${citation.versionDoi}},
  url     = {${url}}
}`;
}
