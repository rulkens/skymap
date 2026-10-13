/**
 * StarCatalogTuningSectionContainer — store boundary for the DebugPanel's
 * star-catalog tuning board. Reads the whole `starCatalogs` cluster and maps each
 * slider key to its setter; the chunk-slots picker writes the override the Gaia
 * asset row folds into its request, which reloads that slot alone.
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
  setStarCatalogChunkSlotsOverride,
} from '../state/starCatalogs/slice';
import { selectTier } from '../../../state/tier/selectors';
import { SOURCE_REGISTRY, Source } from '../../../data/sources';
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

  const onChunkSlotsChange = useCallback(
    (slots: number | null) => dispatch(setStarCatalogChunkSlotsOverride(slots)),
    [dispatch],
  );

  const tier = useAppSelector(selectTier);
  const gaia = SOURCE_REGISTRY[Source.GaiaStars];
  const tierSlots = gaia.type === 'starCatalog' ? gaia.budgets[tier].slots : 0;

  return (
    <StarCatalogTuningSection
      values={starCatalogs}
      onChange={onChange}
      chunkSlots={starCatalogs.chunkSlotsOverride}
      tierSlots={tierSlots}
      onChunkSlotsChange={onChunkSlotsChange}
    />
  );
}

export default memo(StarCatalogTuningSectionContainer);
