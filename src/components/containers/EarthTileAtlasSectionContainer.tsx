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
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import { selectDebugOverlays } from '../../state/settings/selectors';
import { setDebugOverlay } from '../../state/settings/settingsSlice';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type EarthTileAtlasSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function EarthTileAtlasSectionContainer({
  engineHandleRef,
}: EarthTileAtlasSectionContainerProps): ReactElement | null {
  const dispatch = useAppDispatch();
  const overlays = useAppSelector(selectDebugOverlays);
  const onFlyToLonLat = useCallback(
    (lonDeg: number, latDeg: number, body?: BodyId) =>
      dispatch(flyToLonLat({ lonDeg, latDeg, body })),
    [dispatch],
  );
  const onToggle = useCallback(
    (key: DebugOverlayKey, enabled: boolean) => dispatch(setDebugOverlay({ key, enabled })),
    [dispatch],
  );

  const handle = engineHandleRef.current;
  if (!handle) return null;
  return (
    <EarthTileAtlasSection
      earthTileDebug={handle.debug.surfaceTiles}
      flyToLonLat={onFlyToLonLat}
      overlays={overlays}
      onToggle={onToggle}
    />
  );
}

export default memo(EarthTileAtlasSectionContainer);
