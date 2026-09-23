/**
 * CosmicWebDensitySectionContainer — store boundary for the SettingsPanel's
 * "Cosmic web density" section. Reads the master gate and the per-field
 * items Record and wraps both dispatches in `useCallback`. The
 * presentational `CosmicWebDensitySection` imports nothing from `store/` or
 * `state/`.
 */

import { memo, useCallback } from 'react';
import CosmicWebDensitySection from './CosmicWebDensitySection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  selectCosmicWebDensityEnabled,
  selectCosmicWebDensityFieldItems,
} from '../state/cosmicWebDensity/selectors';
import {
  setCosmicWebDensityEnabled,
  writeCosmicWebDensityField,
} from '../state/cosmicWebDensity/slice';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';

function CosmicWebDensitySectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectCosmicWebDensityEnabled);
  const items = useAppSelector(selectCosmicWebDensityFieldItems);

  const onEnabledChange = useCallback(
    (value: boolean) => dispatch(setCosmicWebDensityEnabled(value)),
    [dispatch],
  );

  const onRowEnabledChange = useCallback(
    (id: CosmicWebDensityFieldId, value: boolean) =>
      dispatch(writeCosmicWebDensityField({ id, patch: { enabled: value } })),
    [dispatch],
  );

  return (
    <CosmicWebDensitySection
      enabled={enabled}
      onEnabledChange={onEnabledChange}
      items={items}
      onRowEnabledChange={onRowEnabledChange}
    />
  );
}

export default memo(CosmicWebDensitySectionContainer);
