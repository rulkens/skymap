import type { DetailCardEntry } from './DetailCardEntry';

/** The table `detailCardTable` builds and InfoCard dispatches on: one entry per composed
 * kind type. Entries are base-typed; `detailCardFor` is where a kind's own card meets it. */
export type DetailCardTable = ReadonlyMap<string, DetailCardEntry>;
