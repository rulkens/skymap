import type { AttributionEntry } from '../../../../tools/@types/io/AttributionEntry';
import type { DataFile } from './DataFile';

/**
 * One entry of `ATTRIBUTIONS.md` placed on the data pages: `description` is
 * one sentence on what it is, `family` its family's id, `path` its page and
 * `href` that page with the entry's anchor where it shares one; `files` are
 * its rows of the raw data registry.
 */
export type DataEntry = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly family: string;
  readonly path: string;
  readonly href: string;
  readonly record: AttributionEntry;
  readonly files: readonly DataFile[];
};
