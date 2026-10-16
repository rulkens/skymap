import type { LabelEntry } from './LabelEntry';
import type { ShowEntry } from './ShowEntry';

/** One row of a Layer's static `visibility` data; `key` vs `label` tells the kinds apart. */
export type VisibilityEntry = ShowEntry | LabelEntry;
