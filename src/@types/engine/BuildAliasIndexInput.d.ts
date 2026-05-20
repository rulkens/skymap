import type { SourceType } from '../data/Source';
import type { EngineHandle } from './EngineHandle';

export type BuildAliasIndexInput = {
  handle: EngineHandle;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly SourceType[];
};
