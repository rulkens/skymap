// src/components/containers/EarthTileAtlasSectionContainer.tsx
/**
 * EarthTileAtlasSectionContainer — engine-handle boundary for the Earth tile
 * atlas debug readout. `EarthTileAtlasSection` takes plain getters
 * (`earthTileDebug`, `flyToLonLat`), so this container's only job is
 * pulling those off `engineHandleRef.current.debug` — no store reach, since
 * the section's data is engine-only.
 */

import { memo, type ReactElement } from 'react';
import type { RefObject } from 'react';
import EarthTileAtlasSection from '../DebugPanel/EarthTileAtlasSection';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type EarthTileAtlasSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function EarthTileAtlasSectionContainer({
  engineHandleRef,
}: EarthTileAtlasSectionContainerProps): ReactElement | null {
  const handle = engineHandleRef.current;
  if (!handle) return null;
  return (
    <EarthTileAtlasSection
      earthTileDebug={handle.debug.earthTiles}
      flyToLonLat={handle.debug.flyToLonLat}
    />
  );
}

export default memo(EarthTileAtlasSectionContainer);
