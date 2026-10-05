/**
 * CosmicWebFilamentsSectionContainer — store boundary for the "Cosmic web
 * filaments" SettingsPanel section. Reads `selectCosmicWebFilaments*` and
 * wraps the `setCosmicWebFilamentsEnabled` / `setCosmicWebFilamentsIntensity`
 * dispatches in `useCallback`. The presentational `CosmicWebFilamentsSection`
 * imports nothing from `store/` or `state/`.
 */

import { memo, useCallback } from 'react';
import CosmicWebFilamentsSection from './CosmicWebFilamentsSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  selectCosmicWebFilamentsEnabled,
  selectCosmicWebFilamentsIntensity,
} from '../state/cosmicWebFilaments/selectors';
import {
  setCosmicWebFilamentsEnabled,
  setCosmicWebFilamentsIntensity,
} from '../state/cosmicWebFilaments/slice';

function CosmicWebFilamentsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectCosmicWebFilamentsEnabled);
  const intensity = useAppSelector(selectCosmicWebFilamentsIntensity);

  const onEnabledChange = useCallback(
    (value: boolean) => dispatch(setCosmicWebFilamentsEnabled(value)),
    [dispatch],
  );

  const onIntensityChange = useCallback(
    (value: number) => dispatch(setCosmicWebFilamentsIntensity(value)),
    [dispatch],
  );

  return (
    <CosmicWebFilamentsSection
      enabled={enabled}
      onEnabledChange={onEnabledChange}
      intensity={intensity}
      onIntensityChange={onIntensityChange}
    />
  );
}

export default memo(CosmicWebFilamentsSectionContainer);
