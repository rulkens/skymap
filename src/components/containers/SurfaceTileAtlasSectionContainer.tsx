/**
 * SurfaceTileAtlasSectionContainer — engine-handle + store boundary for the
 * surface tile atlas debug readout. `surfaceTileDebug` still comes off
 * `engineHandleRef.current.debug` (engine-only data), but `flyToLonLat`
 * dispatches the `camera/flyToLonLat` request action instead — the fly-to
 * instrument lives on `watchFlyToLonLatSaga`, not the debug handle.
 */

import { memo, useCallback, type ReactElement } from 'react';
import type { RefObject } from 'react';
import SurfaceTileAtlasSection from '../DebugPanel/SurfaceTileAtlasSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import { selectDebugOverlays } from '../../state/settings/selectors';
import { setDebugOverlay } from '../../state/settings/core/debugSlice';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type SurfaceTileAtlasSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function SurfaceTileAtlasSectionContainer({
  engineHandleRef,
}: SurfaceTileAtlasSectionContainerProps): ReactElement | null {
  const dispatch = useAppDispatch();
  const overlays = useAppSelector(selectDebugOverlays);
  const onFlyToLonLat = useCallback(
    // `altKm` omitted keeps the camera's current altitude — what the text box
    // wants (fly there, stay as high as I am); the landmark buttons pass one.
    (lonDeg: number, latDeg: number, body?: BodyId, altKm?: number) =>
      dispatch(flyToLonLat({ lonDeg, latDeg, body, altKm })),
    [dispatch],
  );
  const onToggle = useCallback(
    (key: DebugOverlayKey, enabled: boolean) => dispatch(setDebugOverlay({ key, enabled })),
    [dispatch],
  );

  const handle = engineHandleRef.current;
  if (!handle) return null;
  return (
    <SurfaceTileAtlasSection
      surfaceTileDebug={handle.debug.surfaceTiles}
      flyToLonLat={onFlyToLonLat}
      overlays={overlays}
      onToggle={onToggle}
    />
  );
}

export default memo(SurfaceTileAtlasSectionContainer);
