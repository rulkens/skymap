// src/components/containers/GalaxyProvenanceSectionContainer.tsx
/**
 * GalaxyProvenanceSectionContainer — store boundary for the catalog-audit
 * table. The provenance settings live in the RTK settings slice and the
 * per-source counts in the engine slice; this container reads both and
 * sums the counts here rather than in a selector — the engine slice holds
 * one entry per source, the panel wants one row, and the store record is a
 * stable reference between commits, so a `useMemo` on it holds without
 * needing `createSelector`'s memoization.
 */

import { memo, useCallback, useMemo } from 'react';
import GalaxyProvenanceSection from '../DebugPanel/GalaxyProvenanceSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectGalaxyProvenance } from '../../state/settings/selectors';
import { selectProvenanceCounts } from '../../state/engine/selectors';
import { setProvenanceHighlight, setProvenanceFilter } from '../../state/settings/settingsSlice';
import { sumProvenanceCounts } from '../../utils/sumProvenanceCounts';
import type { ProvenanceAxisId } from '../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../@types/settings/ProvenanceFilter';

function GalaxyProvenanceSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const provenance = useAppSelector(selectGalaxyProvenance);
  const provenanceCountsBySource = useAppSelector(selectProvenanceCounts);

  const counts = useMemo(
    () => sumProvenanceCounts(provenanceCountsBySource),
    [provenanceCountsBySource],
  );

  const onHighlightChange = useCallback(
    (axis: ProvenanceAxisId, highlight: boolean) =>
      dispatch(setProvenanceHighlight({ axis, highlight })),
    [dispatch],
  );

  const onFilterChange = useCallback(
    (axis: ProvenanceAxisId, filter: ProvenanceFilter) =>
      dispatch(setProvenanceFilter({ axis, filter })),
    [dispatch],
  );

  return (
    <GalaxyProvenanceSection
      provenance={provenance}
      counts={counts}
      onHighlightChange={onHighlightChange}
      onFilterChange={onFilterChange}
    />
  );
}

export default memo(GalaxyProvenanceSectionContainer);
