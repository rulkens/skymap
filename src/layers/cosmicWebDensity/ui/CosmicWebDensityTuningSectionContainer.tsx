/**
 * CosmicWebDensityTuningSectionContainer — store boundary for the
 * DebugPanel's "Cosmic web density (tuning)" section. `selectCosmicWebDensityFieldItems`
 * has another independent subscriber, `CosmicWebDensitySectionContainer`;
 * each re-renders only its own subtree on an items change.
 */

import { memo, useCallback, useMemo } from 'react';
import CosmicWebDensityTuningSection from './CosmicWebDensityTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectCosmicWebDensityFieldItems } from '../state/cosmicWebDensity/selectors';
import { writeCosmicWebDensityField } from '../state/cosmicWebDensity/slice';
import { projectVolumeFieldRows } from './projectVolumeFieldRows';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

function CosmicWebDensityTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCosmicWebDensityFieldItems);

  const rows = useMemo(() => projectVolumeFieldRows(items), [items]);

  const onChange = useCallback(
    (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) =>
      dispatch(writeCosmicWebDensityField({ id, patch })),
    [dispatch],
  );

  return <CosmicWebDensityTuningSection rows={rows} onChange={onChange} />;
}

export default memo(CosmicWebDensityTuningSectionContainer);
