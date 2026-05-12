import type { FamousMetaEntry } from './FamousMetaEntry';
import type { FamousXrefMap } from './FamousXrefMap';

/** Combined payload — both sidecars are useless without each other at the call site. */
export type FamousPayload = { meta: FamousMetaEntry[]; xrefs: FamousXrefMap };
