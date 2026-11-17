/**
 * SurfaceTileAtlasSectionContainer — store boundary for the surface tile atlas
 * debug readout: the snapshot is the body Layer's published fact, and
 * `flyToLonLat` dispatches the `camera/flyToLonLat` request action, which
 * `watchFlyToLonLatSaga` serves.
 */

import { memo, useCallback, type ReactElement } from 'react';
import SurfaceTileAtlasSection from './SurfaceTileAtlasSection';
import { useAppDispatch, useAppSelector } from '../../../../../store/hooks';
import { flyToLonLat } from '../../../../../state/camera/flyToLonLatActions';
import { selectSurfaceTileOverlays } from '../../../state/surfaceTileDebug/selectors';
import { setSurfaceTileOverlay } from '../../../state/surfaceTileDebug/slice';
import { selectSurfaceTileDebug } from './selectSurfaceTileDebug';
import type { SurfaceTileOverlayKey } from '../@types/SurfaceTileOverlayKey';

function SurfaceTileAtlasSectionContainer(): ReactElement {
  const dispatch = useAppDispatch();
  const overlays = useAppSelector(selectSurfaceTileOverlays);
  const surfaceTileDebug = useAppSelector(selectSurfaceTileDebug);
  const onFlyToLonLat = useCallback(
    // `altKm` omitted keeps the camera's current altitude — what the text box
    // wants (fly there, stay as high as I am); the landmark buttons pass one.
    (lonDeg: number, latDeg: number, body?: string, altKm?: number) =>
      dispatch(flyToLonLat({ lonDeg, latDeg, body, altKm })),
    [dispatch],
  );
  const onToggle = useCallback(
    (key: SurfaceTileOverlayKey, enabled: boolean) =>
      dispatch(setSurfaceTileOverlay({ key, enabled })),
    [dispatch],
  );

  return (
    <SurfaceTileAtlasSection
      surfaceTileDebug={surfaceTileDebug}
      flyToLonLat={onFlyToLonLat}
      overlays={overlays}
      onToggle={onToggle}
    />
  );
}

export default memo(SurfaceTileAtlasSectionContainer);
