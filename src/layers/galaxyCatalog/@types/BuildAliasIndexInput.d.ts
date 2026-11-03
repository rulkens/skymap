import type { GalaxyRecordSource } from './GalaxyRecordSource';

export type BuildAliasIndexInput = {
  records: Iterable<GalaxyRecordSource>;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};
