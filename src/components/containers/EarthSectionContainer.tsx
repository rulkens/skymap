// src/components/containers/EarthSectionContainer.tsx
/**
 * EarthSectionContainer — store boundary for the Earth settings subgroup.
 *
 * Owns all Redux reach for the Earth group: reads `selectAtmosphereExposure`
 * and wraps the `setAtmosphereExposure` dispatch in `useCallback`. The
 * presentational `EarthSection` imports nothing from `store/` or `state/`.
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
import { selectAtmosphereExposure } from '../../state/settings/selectors';
import { setAtmosphereExposure } from '../../state/settings/settingsSlice';

function EarthSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const atmosphereExposure = useAppSelector(selectAtmosphereExposure);

  const onAtmosphereExposureChange = useCallback(
    (value: number) => dispatch(setAtmosphereExposure(value)),
    [dispatch],
  );

  return (
    <EarthSection
      atmosphereExposure={atmosphereExposure}
      onAtmosphereExposureChange={onAtmosphereExposureChange}
    />
  );
}

export default memo(EarthSectionContainer);
