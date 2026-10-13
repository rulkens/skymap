/**
 * StarCatalogTuningSectionContainer — store boundary for the DebugPanel's
 * star-catalog tuning board. Reads the whole `starCatalogs` cluster and maps each
 * slider key to its existing setter action.
 */

import { memo, useCallback } from 'react';
import { StarCatalogTuningSection } from './StarCatalogTuningSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectStarCatalogs } from '../state/starCatalogs/selectors';
import {
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureMidX,
  setStarCatalogExposureFarX,
  setStarCatalogAggregateIntensityCap,
} from '../state/starCatalogs/slice';
import type { StarCatalogTuningKey } from '../@types/StarCatalogTuningKey';

const SETTERS = {
  refineThreshold: setStarCatalogRefineThreshold,
  glowOverlap: setStarCatalogGlowOverlap,
  exposureNearX: setStarCatalogExposureNearX,
  exposureMidX: setStarCatalogExposureMidX,
  exposureFarX: setStarCatalogExposureFarX,
  aggregateIntensityCap: setStarCatalogAggregateIntensityCap,
} as const;

function StarCatalogTuningSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const starCatalogs = useAppSelector(selectStarCatalogs);

  const onChange = useCallback(
    (key: StarCatalogTuningKey, value: number) => dispatch(SETTERS[key](value)),
    [dispatch],
  );

  return <StarCatalogTuningSection values={starCatalogs} onChange={onChange} />;
}

export default memo(StarCatalogTuningSectionContainer);
