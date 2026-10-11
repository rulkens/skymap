/**
 * StructuresSectionContainer — store boundary for the Structures settings
 * section: reads `selectStructureItems` and the structure Layer's `counts` fact
 * (`selectStructureCounts`), projects `items[cat].enabled` to the flat
 * visibility record the checkboxes read, and wraps `setStructureItemEnabled`.
 * The presentational `StructuresSection` imports nothing from `store/` or
 * `state/`. The handler depends on `[dispatch]` only: `store.dispatch` never
 * changes, so the handler keeps one identity and the child's `memo` bails.
 */

import { memo, useCallback, useMemo } from 'react';
import StructuresSection from './StructuresSection/StructuresSection';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectStructureItems } from '../state/structures/selectors';
import { selectStructureCounts } from '../../../state/engine/selectors';
import { setStructureItemEnabled } from '../state/structures/slice';
import { projectMarkerCategoryVisibility } from '../../../state/settings/projectMarkerCategoryVisibility';
import type { StructureId } from '../../../@types/data/structure/StructureId';

function StructuresSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

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
