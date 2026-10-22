/**
 * StarCatalogTuningSectionContainer — store boundary for the DebugPanel's
 * star-catalog tuning board. Reads the whole `starCatalogs` cluster and maps each
 * slider key to its setter; the chunk-slots picker writes the override the
 * planner applies without a refetch, and a refused size's message shows under it.
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
  setStarCatalogPoolRecordsOverride,
} from '../state/starCatalogs/slice';
import { selectTier } from '../../../state/tier/selectors';
import { SOURCE_REGISTRY, Source } from '../../../data/sources';
import { selectStarPoolRecordsError } from '../../../state/engine/selectors';
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

  const onPoolRecordsChange = useCallback(
    (records: number | null) => dispatch(setStarCatalogPoolRecordsOverride(records)),
    [dispatch],
  );

  const poolRecordsError = useAppSelector(selectStarPoolRecordsError);
  const tier = useAppSelector(selectTier);
  const gaia = SOURCE_REGISTRY[Source.GaiaStars];
  const tierPoolRecords = gaia.type === 'starCatalog' ? gaia.budgets[tier].poolRecords : 0;

  return (
    <StarCatalogTuningSection
      values={starCatalogs}
      onChange={onChange}
      poolRecords={starCatalogs.poolRecordsOverride}
      tierPoolRecords={tierPoolRecords}
      onPoolRecordsChange={onPoolRecordsChange}
      poolRecordsError={poolRecordsError}
    />
  );
}

export default memo(StarCatalogTuningSectionContainer);
