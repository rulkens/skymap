import type { GalaxyRecordSource } from '../../records/@types/GalaxyRecordSource';

export type BuildAliasIndexInput = {
  records: Iterable<GalaxyRecordSource>;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};
