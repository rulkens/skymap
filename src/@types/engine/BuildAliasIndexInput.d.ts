import type { GalaxyRecordSource } from '../data/galaxyCatalog/GalaxyRecordSource';

export type BuildAliasIndexInput = {
  records: Iterable<GalaxyRecordSource>;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};
