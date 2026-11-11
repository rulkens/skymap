/** The app's search index, as the command palette ranks it: what the object picker searches and names from. */
import type { AliasIndexEntry } from '../../../../../src/@types/engine/AliasIndexEntry';
import type { LayerSearchEntry } from '../../../../../src/@types/engine/layer/LayerSearchEntry';
import type { StructureSearchEntry } from '../../../../../src/@types/engine/StructureSearchEntry';
import type { FamousGalaxyMetaEntry } from '../../../../../src/@types/loading/FamousGalaxyMetaEntry';

export type ObjectIndex = {
  readonly famous: readonly FamousGalaxyMetaEntry[];
  readonly aliases: readonly AliasIndexEntry[];
  readonly structures: readonly StructureSearchEntry[];
  readonly layerRows: readonly LayerSearchEntry[];
  /** Focus steps' selection refs by `refKey`, named in the studio slice (the palette never holds refs). */
  readonly refNames: Readonly<Record<string, string>>;
};
