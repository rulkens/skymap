/**
 * Store + engine-handle boundary for the terrain-pick marker's own board: its
 * overlay toggle and radius knob come from Redux, the two readouts from the
 * engine's camera snapshot (the same getter `CameraStateSection` polls).
 */

import { memo, useCallback, type ReactElement, type RefObject } from 'react';
import { TerrainPickMarkerTuningSection } from '../DebugPanel/TerrainPickMarkerTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectDebugOverlays,
  selectTerrainPickMarkerRadiusM,
} from '../../state/settings/selectors';
import { setDebugOverlay, setTerrainPickMarkerRadiusM } from '../../state/settings/core/debugSlice';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type TerrainPickMarkerTuningSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function TerrainPickMarkerTuningSectionContainer({
  engineHandleRef,
}: TerrainPickMarkerTuningSectionContainerProps): ReactElement {
  const dispatch = useAppDispatch();
  const radiusM = useAppSelector(selectTerrainPickMarkerRadiusM);
  const overlays = useAppSelector(selectDebugOverlays);

  const onRadiusChange = useCallback(
    (metres: number) => dispatch(setTerrainPickMarkerRadiusM(metres)),
    [dispatch],
  );

  const onToggle = useCallback(
    (key: DebugOverlayKey, enabled: boolean) => dispatch(setDebugOverlay({ key, enabled })),
    [dispatch],
  );

  return (
    <TerrainPickMarkerTuningSection
      radiusM={radiusM}
      onRadiusChange={onRadiusChange}
      overlays={overlays}
      onToggle={onToggle}
      // Unlike `CameraStateSectionContainer`, a missing handle must not blank
      // the section: the toggle is exactly what a reader reaches for before
      // the engine has produced a frame worth reading.
      cameraDebug={engineHandleRef.current?.debug.cameraDebug ?? null}
    />
  );
}

export default memo(TerrainPickMarkerTuningSectionContainer);
