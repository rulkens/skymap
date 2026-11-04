/**
 * Store boundary for the terrain-pick marker's own board: its overlay toggle and
 * radius knob are settings, the two readouts the body Layer's published fact.
 */

import { memo, useCallback, type ReactElement } from 'react';
import { TerrainPickMarkerTuningSection } from './TerrainPickMarkerTuningSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  selectTerrainPickMarkerEnabled,
  selectTerrainPickMarkerRadiusM,
} from '../../state/terrainPickMarker/selectors';
import {
  setTerrainPickMarkerEnabled,
  setTerrainPickMarkerRadiusM,
} from '../../state/terrainPickMarker/slice';
import { selectTerrainPickMarkerReadout } from './selectTerrainPickMarkerReadout';

function TerrainPickMarkerTuningSectionContainer(): ReactElement {
  const dispatch = useAppDispatch();
  const radiusM = useAppSelector(selectTerrainPickMarkerRadiusM);
  const enabled = useAppSelector(selectTerrainPickMarkerEnabled);
  const readout = useAppSelector(selectTerrainPickMarkerReadout);

  const onRadiusChange = useCallback(
    (metres: number) => dispatch(setTerrainPickMarkerRadiusM(metres)),
    [dispatch],
  );

  const onEnabledChange = useCallback(
    (on: boolean) => dispatch(setTerrainPickMarkerEnabled(on)),
    [dispatch],
  );

  return (
    <TerrainPickMarkerTuningSection
      radiusM={radiusM}
      onRadiusChange={onRadiusChange}
      enabled={enabled}
      onEnabledChange={onEnabledChange}
      readout={readout}
    />
  );
}

export default memo(TerrainPickMarkerTuningSectionContainer);
