import type { FamousXref } from './FamousXref';

/** The whole xrefs object, keyed by famous id. */
export type FamousXrefMap = Record<string, FamousXref | null>;
