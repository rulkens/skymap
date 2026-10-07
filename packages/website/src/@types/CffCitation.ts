/**
 * What the site reads out of the repository's CITATION.cff. `doi` is the one
 * the file names, which on Zenodo follows the newest release; `versionDoi` is
 * its `identifiers` entry, with the version its description names, which
 * need not be `version`; `released` is an ISO date.
 */
export type CffCitation = {
  readonly title: string;
  readonly version: string;
  readonly released: string;
  readonly doi: string;
  readonly versionDoi?: { readonly doi: string; readonly version: string };
  readonly url: string;
  readonly licence: string;
  readonly authors: readonly { readonly family: string; readonly given: string }[];
};
