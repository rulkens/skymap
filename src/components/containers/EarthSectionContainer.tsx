// src/components/containers/EarthSectionContainer.tsx
/**
 * EarthSectionContainer — store boundary for the Earth settings subgroup.
 *
 * Owns all Redux reach for the Earth group: reads `selectAtmosphereExposure` +
 * `selectTwilightSoftness` + `selectAmbientLight` + `selectOceanRoughness` and
 * wraps the `setAtmosphereExposure` / `setTwilightSoftness` / `setAmbientLight` /
 * `setOceanRoughness` dispatches in `useCallback`. The presentational
 * `EarthSection` imports nothing from `store/` or `state/`.
 *
 * ### Handler stability
 *
 * The handler closes over no store-read values — it only needs `dispatch`,
 * which is the invariant `store.dispatch` across the component's lifetime.
 * `[dispatch]` is the sole dep, giving the handler permanent stable identity
 * and letting `EarthSection`'s `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback } from 'react';
import EarthSection from '../SettingsPanel/EarthSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectAtmosphereExposure,
  selectTwilightSoftness,
  selectAmbientLight,
  selectOceanRoughness,
} from '../../state/settings/selectors';
import {
  setAtmosphereExposure,
  setTwilightSoftness,
  setAmbientLight,
  setOceanRoughness,
} from '../../state/settings/settingsSlice';

function EarthSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const atmosphereExposure = useAppSelector(selectAtmosphereExposure);
  const twilightSoftness = useAppSelector(selectTwilightSoftness);
  const ambientLight = useAppSelector(selectAmbientLight);
  const oceanRoughness = useAppSelector(selectOceanRoughness);

  const onAtmosphereExposureChange = useCallback(
    (value: number) => dispatch(setAtmosphereExposure(value)),
    [dispatch],
  );
  const onTwilightSoftnessChange = useCallback(
    (value: number) => dispatch(setTwilightSoftness(value)),
    [dispatch],
  );
  const onAmbientLightChange = useCallback(
    (value: number) => dispatch(setAmbientLight(value)),
    [dispatch],
  );
  const onOceanRoughnessChange = useCallback(
    (value: number) => dispatch(setOceanRoughness(value)),
    [dispatch],
  );

  return (
    <EarthSection
      atmosphereExposure={atmosphereExposure}
      onAtmosphereExposureChange={onAtmosphereExposureChange}
      twilightSoftness={twilightSoftness}
      onTwilightSoftnessChange={onTwilightSoftnessChange}
      ambientLight={ambientLight}
      onAmbientLightChange={onAmbientLightChange}
      oceanRoughness={oceanRoughness}
      onOceanRoughnessChange={onOceanRoughnessChange}
    />
  );
}

export default memo(EarthSectionContainer);
