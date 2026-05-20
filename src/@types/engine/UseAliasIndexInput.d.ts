import type { RefObject } from 'react';
import type { SourceType } from '../data/Source';
import type { EngineHandle } from './EngineHandle';

export type UseAliasIndexInput = {
  paletteOpen: boolean;
  sourceCounts: Partial<Record<SourceType, number>>;
  engineHandleRef: RefObject<EngineHandle | null>;
};
