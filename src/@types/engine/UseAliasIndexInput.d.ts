import type { RefObject } from 'react';
import type { Source } from '../../data/sources';
import type { EngineHandle } from './EngineHandle';

export type UseAliasIndexInput = {
  paletteOpen: boolean;
  sourceCounts: Partial<Record<Source, number>>;
  engineHandleRef: RefObject<EngineHandle | null>;
};
