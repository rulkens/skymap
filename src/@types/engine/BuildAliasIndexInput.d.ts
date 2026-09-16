import type { SourceType } from '../data/SourceType';
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';

export type BuildAliasIndexInput = {
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly SourceType[];
};
