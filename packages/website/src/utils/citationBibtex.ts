import type { SoftwareCitation } from '../@types/SoftwareCitation';

/**
 * The software citation as a BibTeX entry. `url` is the repository's address.
 * The title is in two pairs of braces so that a style which lower-cases titles
 * leaves "WebGPU" alone. `@software` is biblatex's type; BibTeX styles that
 * do not know it treat the entry as `@misc`.
 */
export function citationBibtex(citation: SoftwareCitation, url: string): string {
  const authors = citation.authors
    .map((author) => `${author.family}, ${author.given}`)
    .join(' and ');
  return `@software{skymap,
  author    = {${authors}},
  title     = {{${citation.title}}},
  version   = {${citation.version}},
  year      = {${citation.released.slice(0, 4)}},
  publisher = {Zenodo},
  doi       = {${citation.versionDoi ?? citation.conceptDoi}},
  url       = {${url}}
}`;
}
