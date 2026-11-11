/** Store boundary for the DebugPanel's satellite tuning. */

import { memo, useCallback } from 'react';
import SatelliteTuningSection from './SatelliteTuningSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectSatelliteTuning } from '../../state/satelliteTuning/selectors';
import {
  resetSatelliteTuning,
  setSatelliteAmbient,
  setSatelliteColor,
} from '../../state/satelliteTuning/slice';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';

function SatelliteTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectSatelliteTuning);
  const onColorChange = useCallback(
    (id: SatelliteProfileId, color: Vec3) => dispatch(setSatelliteColor({ id, color })),
    [dispatch],
  );
  const onAmbientChange = useCallback(
    (ambient: number) => dispatch(setSatelliteAmbient(ambient)),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetSatelliteTuning()), [dispatch]);

  return (
    <SatelliteTuningSection
      tuning={tuning}
      onColorChange={onColorChange}
      onAmbientChange={onAmbientChange}
      onReset={onReset}
    />
  );
}

export default memo(SatelliteTuningSectionContainer);
