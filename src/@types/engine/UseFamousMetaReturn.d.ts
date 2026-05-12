import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../loading/FamousXrefMap';

export type UseFamousMetaReturn = {
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};
