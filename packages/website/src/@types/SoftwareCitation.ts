/**
 * skymap as a thing to cite: what CITATION.cff says of the newest release,
 * with the two DOIs Zenodo gives it. `conceptDoi` follows the newest release;
 * `versionDoi` is the DOI of the release `version` names, and is absent from
 * the day the file's version moves until Zenodo's new DOI is written into it.
 */
export type SoftwareCitation = {
  readonly title: string;
  readonly version: string;
  readonly released: string;
  readonly authors: readonly { readonly family: string; readonly given: string }[];
  readonly conceptDoi: string;
  readonly versionDoi?: string;
};
