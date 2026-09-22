/**
 * MemorySectionContainer — engine-handle boundary for the GPU-memory debug
 * readout. Mirrors `SurfaceTileAtlasSectionContainer`: `gpuMemory` comes off
 * `engineHandleRef.current.debug`, engine-only data with no store reach.
 */

import { memo, type ReactElement } from 'react';
import type { RefObject } from 'react';
import MemorySection from '../DebugPanel/MemorySection';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type MemorySectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function MemorySectionContainer({
  engineHandleRef,
}: MemorySectionContainerProps): ReactElement | null {
  const handle = engineHandleRef.current;
  if (!handle) return null;
  return <MemorySection gpuMemory={handle.debug.gpuMemory} />;
}

export default memo(MemorySectionContainer);
