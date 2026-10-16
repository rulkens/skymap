import type { AliasIndexEntry } from '../engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../engine/StructureSearchEntry';
import type { LayerSearchEntry } from '../engine/layer/LayerSearchEntry';
import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';

/** The four indexes the palette ranks over, read with the same selectors the palette container uses. */
export type RemoteSearchInputs = {
  entries: readonly FamousGalaxyMetaEntry[];
  aliasIndex: readonly AliasIndexEntry[];
  structures: readonly StructureSearchEntry[];
  layerRows: readonly LayerSearchEntry[];
};
