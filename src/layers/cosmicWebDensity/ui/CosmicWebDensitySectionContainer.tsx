/**
 * CosmicWebDensitySectionContainer — store boundary for the SettingsPanel's
 * "Cosmic web density" section. Reads the master gate and the per-field
 * items Record, projects it via `projectVolumeFieldRows`, and wraps both
 * dispatches in `useCallback`. The presentational `CosmicWebDensitySection`
 * imports nothing from `store/` or `state/`.
 *
 * `selectCosmicWebDensityFieldItems` has another independent subscriber,
 * `CosmicWebDensityTuningSectionContainer`; each re-renders only its own
 * subtree on an items change.
 */

import { memo, useCallback, useMemo } from 'react';
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
import { projectVolumeFieldRows } from './projectVolumeFieldRows';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';

function CosmicWebDensitySectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectCosmicWebDensityEnabled);
  const items = useAppSelector(selectCosmicWebDensityFieldItems);

  const rows = useMemo(() => projectVolumeFieldRows(items), [items]);

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
      rows={rows}
      onRowEnabledChange={onRowEnabledChange}
    />
  );
}

export default memo(CosmicWebDensitySectionContainer);
