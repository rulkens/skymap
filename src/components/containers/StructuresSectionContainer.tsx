// src/components/containers/StructuresSectionContainer.tsx
/**
 * StructuresSectionContainer — store boundary for the Structures settings section.
 *
 * Owns all Redux reach for the Structures group: reads `selectStructureItems`
 * and wraps `setStructureItemEnabled` in a `useCallback`. The presentational
 * `StructuresSection` imports nothing from `store/` or `state/`.
 *
 * The marker-category-visibility projection (previously in App.tsx) lives here
 * because it is structure-group-local: it projects `items[cat].enabled` → the
 * flat `Record<StructureId, boolean>` the section's checkboxes read. Moving it
 * into the section avoids a prop-threading chain through App → SettingsPanel →
 * StructuresSection and un-braids "App knows the section's projection shape"
 * from App's actual responsibilities.
 *
 * `structureCounts` is the only prop threaded in from the parent — it comes from
 * the engine's async catalog-landing events, not from the Redux store, so the
 * parent (App or a future EngineContext) still owns it. Counts arrive at low
 * frequency (one per catalog load), so prop-threading them does not undermine
 * the re-render win.
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
import { setStructureItemEnabled } from '../../state/settings/settingsSlice';
import { projectMarkerCategoryVisibility } from '../../state/settings/projectMarkerCategoryVisibility';
import type { StructureId } from '../../@types/data/structure/StructureId';

export type StructuresSectionContainerProps = {
  /**
   * Per-category loaded structure counts. Engine-absent before any catalog
   * lands; the presentational section renders toggles without counts when
   * undefined.
   */
  structureCounts?: Partial<Record<StructureId, number>>;
};

function StructuresSectionContainer({
  structureCounts,
}: StructuresSectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();

  const structureItems = useAppSelector(selectStructureItems);

  // Project items → flat visibility record. Rebuilds only when the stable
  // `structureItems` reference changes (Immer structural sharing guarantees
  // this is fine-grained). Moved verbatim from App.tsx:209–212.
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
