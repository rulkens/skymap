/** Store boundary for the DebugPanel's asteroid tuning. */

import { memo, useCallback } from 'react';
import AsteroidTuningSection from './AsteroidTuningSection';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectAsteroidTuning } from '../../state/asteroidTuning/selectors';
import {
  resetAsteroidTuning,
  setAsteroidBeltColor,
  setAsteroidColor,
  setAsteroidColorBy,
  setAsteroidSizeBy,
  setAsteroidSlider,
} from '../../state/asteroidTuning/slice';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';
import type { AsteroidColorBy } from '../../@types/AsteroidColorBy';
import type { AsteroidSizeBy } from '../../@types/AsteroidSizeBy';

function AsteroidTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector(selectAsteroidTuning);
  const onColorByChange = useCallback(
    (mode: AsteroidColorBy) => dispatch(setAsteroidColorBy(mode)),
    [dispatch],
  );
  const onSizeByChange = useCallback(
    (mode: AsteroidSizeBy) => dispatch(setAsteroidSizeBy(mode)),
    [dispatch],
  );
  const onBeltColorChange = useCallback(
    (end: keyof AsteroidBeltRamp, color: Vec3) => dispatch(setAsteroidBeltColor({ end, color })),
    [dispatch],
  );
  const onColorChange = useCallback(
    (cls: AsteroidClass, color: Vec3) => dispatch(setAsteroidColor({ cls, color })),
    [dispatch],
  );
  const onSliderChange = useCallback(
    (key: AsteroidTuningSliderKey, value: number) => dispatch(setAsteroidSlider({ key, value })),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetAsteroidTuning()), [dispatch]);

  return (
    <AsteroidTuningSection
      tuning={tuning}
      onColorByChange={onColorByChange}
      onSizeByChange={onSizeByChange}
      onColorChange={onColorChange}
      onBeltColorChange={onBeltColorChange}
      onSliderChange={onSliderChange}
      onReset={onReset}
    />
  );
}

export default memo(AsteroidTuningSectionContainer);
