/**
 * EarthTuningSectionContainer — Earth's DebugPanel knobs and their store
 * boundary in one file, as LocalBubbleTuningSectionContainer does.
 */

import { memo, useCallback } from 'react';
import type { ActionCreatorWithPayload } from '@reduxjs/toolkit';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import type { EarthSettings } from '../../../@types/settings/EarthSettings';
import { EARTH_SLIDER_FIELDS } from '../data/earthSliderFields';
import { selectEarth } from '../state/earth/selectors';
import { setAtmosphereExposure, setAmbientLight, setOceanRoughness } from '../state/earth/slice';

const SETTER_BY_KEY: Record<keyof EarthSettings, ActionCreatorWithPayload<number>> = {
  atmosphereExposure: setAtmosphereExposure,
  ambientLight: setAmbientLight,
  oceanRoughness: setOceanRoughness,
};

function EarthTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const earth = useAppSelector(selectEarth);
  const onSliderChange = useCallback(
    (key: keyof EarthSettings, value: number) => dispatch(SETTER_BY_KEY[key](value)),
    [dispatch],
  );

  return (
    <DebugTuningSection
      title="Earth tuning"
      fields={EARTH_SLIDER_FIELDS}
      values={earth}
      onSliderChange={onSliderChange}
    />
  );
}

export default memo(EarthTuningSectionContainer);
