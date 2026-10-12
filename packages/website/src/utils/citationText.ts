import type { SoftwareCitation } from '../@types/SoftwareCitation';

/** The software citation as one line of plain text, for a reference list and for the copy control beside it. */
export function citationText(citation: SoftwareCitation): string {
  const authors = citation.authors
    .map((author) => `${author.family}, ${author.given.replace(/(\p{L})\p{L}*\.?/gu, '$1.')}`)
    .join(', ');
  return `${authors} (${citation.released.slice(0, 4)}). ${citation.title} (version ${citation.version}). Zenodo. https://doi.org/${citation.versionDoi ?? citation.conceptDoi}`;
}
