/**
 * Store boundary for the terrain-pick marker's own board: its overlay toggle and
 * radius knob are settings, the two readouts the body Layer's published fact.
 */

import { memo, useCallback, type ReactElement } from 'react';
import { TerrainPickMarkerTuningSection } from './TerrainPickMarkerTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  selectDebugOverlays,
  selectTerrainPickMarkerRadiusM,
} from '../../../state/settings/selectors';
import {
  setDebugOverlay,
  setTerrainPickMarkerRadiusM,
} from '../../../state/settings/core/debugSlice';
import { selectTerrainPickMarkerReadout } from './selectTerrainPickMarkerReadout';
import type { DebugOverlayKey } from '../../../@types/data/debug/DebugOverlayKey';

function TerrainPickMarkerTuningSectionContainer(): ReactElement {
  const dispatch = useAppDispatch();
  const radiusM = useAppSelector(selectTerrainPickMarkerRadiusM);
  const overlays = useAppSelector(selectDebugOverlays);
  const readout = useAppSelector(selectTerrainPickMarkerReadout);

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
      readout={readout}
    />
  );
}

export default memo(TerrainPickMarkerTuningSectionContainer);
