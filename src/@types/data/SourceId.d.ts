import { SOURCE_IDS } from '../../data/sourceIds';

/** Union of every source's readable `id` (the string twin of the numeric Source code). */
export type SourceId = (typeof SOURCE_IDS)[number];
