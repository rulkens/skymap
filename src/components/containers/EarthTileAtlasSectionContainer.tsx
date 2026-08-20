// src/components/containers/EarthTileAtlasSectionContainer.tsx
/**
 * EarthTileAtlasSectionContainer — engine-handle + store boundary for the
 * Earth tile atlas debug readout. `earthTileDebug` still comes off
 * `engineHandleRef.current.debug` (engine-only data), but `flyToLonLat` now
 * dispatches the `camera/flyToLonLat` request action — the fly-to instrument
 * moved off the debug handle onto `watchFlyToLonLatSaga`.
 */

import { memo, useCallback, type ReactElement } from 'react';
import type { RefObject } from 'react';
import EarthTileAtlasSection from '../DebugPanel/EarthTileAtlasSection';
import { useAppDispatch } from '../../store/hooks';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type EarthTileAtlasSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function EarthTileAtlasSectionContainer({
  engineHandleRef,
}: EarthTileAtlasSectionContainerProps): ReactElement | null {
  const dispatch = useAppDispatch();
  const onFlyToLonLat = useCallback(
    (lonDeg: number, latDeg: number) => dispatch(flyToLonLat({ lonDeg, latDeg })),
    [dispatch],
  );

  const handle = engineHandleRef.current;
  if (!handle) return null;
  return (
    <EarthTileAtlasSection earthTileDebug={handle.debug.earthTiles} flyToLonLat={onFlyToLonLat} />
  );
}

export default memo(EarthTileAtlasSectionContainer);
