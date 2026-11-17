/** Store boundary for the DebugPanel's satellite tuning. */

import { memo, useCallback } from 'react';
import SatelliteTuningSection from './SatelliteTuningSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectSatelliteTuning } from '../../state/satelliteTuning/selectors';
import {
  resetSatelliteTuning,
  setSatelliteColor,
  setSatelliteSlider,
} from '../../state/satelliteTuning/slice';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';
import type { SatelliteTuningSliderKey } from '../../@types/SatelliteTuningSliderKey';

function SatelliteTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectSatelliteTuning);
  const onColorChange = useCallback(
    (id: SatelliteProfileId, color: Vec3) => dispatch(setSatelliteColor({ id, color })),
    [dispatch],
  );
  const onSliderChange = useCallback(
    (key: SatelliteTuningSliderKey, value: number) => dispatch(setSatelliteSlider({ key, value })),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetSatelliteTuning()), [dispatch]);

  return (
    <SatelliteTuningSection
      tuning={tuning}
      onColorChange={onColorChange}
      onSliderChange={onSliderChange}
      onReset={onReset}
    />
  );
}

export default memo(SatelliteTuningSectionContainer);
