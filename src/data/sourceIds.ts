import { SOURCE_ENTRIES } from './sourceEntries';

/** Every source's readable `id`, in registry order. Runtime companion to SourceId. */
export const SOURCE_IDS = SOURCE_ENTRIES.map((e) => e.id);
