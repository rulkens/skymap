import type { Source } from '../../data/sources';
import type { EngineHandle } from './EngineHandle';

export type BuildAliasIndexInput = {
  handle: EngineHandle;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly Source[];
};
