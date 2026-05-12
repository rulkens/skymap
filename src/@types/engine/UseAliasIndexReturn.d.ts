import type { AliasIndexEntry } from './AliasIndexEntry';

export type UseAliasIndexReturn = {
  aliasIndex: readonly AliasIndexEntry[] | null;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};
