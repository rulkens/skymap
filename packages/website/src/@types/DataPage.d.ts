import type { DataEntry } from './DataEntry';
import type { DataFamily } from './DataFamily';

/** One generated page under `/docs/data/`: a single source, or a family whose entries share it. `slug` is the last part of `path`. */
export type DataPage = {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly family: DataFamily;
  readonly entries: readonly DataEntry[];
};
