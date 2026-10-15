/**
 * LabelsAndGuidesSectionContainer — store boundary for the Labels & Guides
 * settings section. `selectToggleRows` builds every row as data (value plus
 * the action that sets it); this container only binds each row's `set` to
 * `dispatch`, so the presentational `LabelsAndGuidesSection` imports nothing
 * from `store/` or `state/` and has no notion of where any row's bit lives.
 *
 * The selector's output is referentially stable across unrelated writes and
 * `dispatch` is the invariant `store.dispatch`, so the mapped rows keep their
 * identity and the `memo` section bails on parent re-renders.
 */

import { memo, useMemo } from 'react';
import LabelsAndGuidesSection from '../SettingsPanel/LabelsAndGuidesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectToggleRows } from '../../compositions/selectToggleRows';
import type { SectionRow } from '../../@types/components/SectionRow';
import type { LayerSettingsRow } from '../../@types/engine/layer/LayerSettingsRow';

type LabelsAndGuidesSectionContainerProps = {
  /** Every composed Layer's `labelsAndGuides` `ui` entry, in composition order. */
  readonly layerRows: readonly LayerSettingsRow[];
};

function LabelsAndGuidesSectionContainer({
  layerRows,
}: LabelsAndGuidesSectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const toggleRows = useAppSelector((s) => selectToggleRows(s, layerRows));

  const rows: ReadonlyArray<SectionRow> = useMemo(
    () =>
      toggleRows.map((row) => ({
        id: row.id,
        label: row.label,
        enabled: row.enabled,
        onChange: (enabled: boolean) => dispatch(row.set(enabled)),
      })),
    [toggleRows, dispatch],
  );

  return <LabelsAndGuidesSection rows={rows} />;
}

export default memo(LabelsAndGuidesSectionContainer);
