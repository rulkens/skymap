import { SOURCE_IDS } from '../../data/sourceIds';

/** Union of every source's readable `id`. */
export type SourceId = (typeof SOURCE_IDS)[number];
