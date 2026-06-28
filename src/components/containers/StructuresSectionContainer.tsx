// src/components/containers/StructuresSectionContainer.tsx
/**
 * StructuresSectionContainer — store boundary for the Structures settings section.
 *
 * Owns all Redux reach for the Structures group: reads `selectStructureItems`
 * and `selectStructureCounts` from the engine slice, and wraps
 * `setStructureItemEnabled` in a `useCallback`. The presentational
 * `StructuresSection` imports nothing from `store/` or `state/`.
 *
 * The marker-category-visibility projection lives here because it is
 * structure-group-local: it projects `items[cat].enabled` → the flat
 * `Record<StructureId, boolean>` the section's checkboxes read.
 *
 * `structureCounts` is read from the engine Redux slice via `useAppSelector`
 * (the engine dispatches `engineStructureCountsChanged` as each catalog lands).
 * This replaces the old prop-threading path through App → SettingsPanel →
 * StructuresSectionContainer, keeping engine state reach in the container layer
 * as the Container convention requires.
 *
 * Why the handler uses `[dispatch]` only: `dispatch` from `useAppDispatch()` is
 * the invariant `store.dispatch` — it never changes across the component's
 * lifetime. Handlers that close over no store-read values only need `dispatch`
 * in their dep array, giving each handler permanent stable identity and letting
 * the presentational child's `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback, useMemo } from 'react';
import StructuresSection from '../SettingsPanel/StructuresSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectStructureItems } from '../../state/settings/selectors';
import { selectStructureCounts } from '../../state/engine/selectors';
import { setStructureItemEnabled } from '../../state/settings/settingsSlice';
import { projectMarkerCategoryVisibility } from '../../state/settings/projectMarkerCategoryVisibility';
import type { StructureId } from '../../@types/data/structure/StructureId';

function StructuresSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  // Per-category loaded structure counts from the engine slice.  The engine
  // dispatches `engineStructureCountsChanged` after each catalog load.
  const structureCounts = useAppSelector(selectStructureCounts);

  const structureItems = useAppSelector(selectStructureItems);

  // Project items → flat visibility record. Rebuilds only when the stable
  // `structureItems` reference changes (Immer structural sharing guarantees
  // this is fine-grained).
  const markerCategoryVisibility = useMemo(
    () => projectMarkerCategoryVisibility(structureItems),
    [structureItems],
  );

  const onSetMarkerCategoryVisibility = useCallback(
    (id: StructureId, enabled: boolean) => dispatch(setStructureItemEnabled({ id, enabled })),
    [dispatch],
  );

  return (
    <StructuresSection
      markerCategoryVisibility={markerCategoryVisibility}
      onSetMarkerCategoryVisibility={onSetMarkerCategoryVisibility}
      structureCounts={structureCounts}
    />
  );
}

export default memo(StructuresSectionContainer);
