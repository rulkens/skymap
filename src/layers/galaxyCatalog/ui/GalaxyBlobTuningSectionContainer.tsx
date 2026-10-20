/**
 * GalaxyBlobTuningSectionContainer — the DebugPanel's board for the galaxy octree's
 * refine threshold and blob glows (gain, overlap, peak cap), tuned live. The values
 * are settings leaves the pooled renderer reads every draw; nothing persists them.
 */

import { memo, useCallback } from 'react';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectGalaxyCatalogs } from '../state/galaxyCatalogs/selectors';
import { setGalaxyBlobTuning } from '../state/galaxyCatalogs/slice';
import { GALAXY_BLOB_TUNING_FIELDS } from './galaxyBlobTuningFields';
import type { GalaxyOctreeTuningKey } from '../@types/GalaxyOctreeTuningKey';

function GalaxyBlobTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const galaxyCatalogs = useAppSelector(selectGalaxyCatalogs);
  const onChange = useCallback(
    (key: GalaxyOctreeTuningKey, value: number) => dispatch(setGalaxyBlobTuning({ key, value })),
    [dispatch],
  );
  return (
    <DebugTuningSection
      title="Galaxy octree blobs"
      fields={GALAXY_BLOB_TUNING_FIELDS}
      values={galaxyCatalogs}
      onSliderChange={onChange}
    />
  );
}

export default memo(GalaxyBlobTuningSectionContainer);
