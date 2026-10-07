import type { AttributionRecord } from './AttributionRecord';
import type { DataFile } from './DataFile';

/**
 * One entry of `ATTRIBUTIONS.md` placed on the data pages. `title` is its
 * short name, `family` its family's id, `path` the page it is printed on and
 * `href` that page with the entry's anchor where it shares the page.
 * `checked` is the ISO date its terms were read, `files` its rows of the raw
 * data registry, `names` the ids of other entries its terms point at.
 */
export type DataEntry = {
  readonly id: string;
  readonly title: string;
  readonly family: string;
  readonly path: string;
  readonly href: string;
  readonly checked: string;
  readonly record: AttributionRecord;
  readonly files: readonly DataFile[];
  readonly names: readonly string[];
};
