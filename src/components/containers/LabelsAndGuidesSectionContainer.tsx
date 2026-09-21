/**
 * LabelsAndGuidesSectionContainer — store boundary for the Labels & Guides
 * settings section.
 *
 * Owns all Redux reach for the Labels & Guides group: reads
 * `selectStructureItems`, `selectGalaxyCatalogItems`, `selectStarCatalogItems`,
 * `selectBodyItems` and `selectMilkyWayLabelEnabled`, bundles them into the
 * `LabelHomes` the label-projection reads, and wraps the label dispatch in a
 * `useCallback`. It also owns the orbit-trails guide row — a flat singleton
 * setting that routes straight to its own setter. All of it is assembled into
 * one uniform `SectionRow` array; the presentational `LabelsAndGuidesSection`
 * imports nothing from `store/` or `state/` and has no notion of where any
 * row's bit lives. `layerRows` (a Layer's `labelsAndGuides` `ui` entries,
 * constellations among them) are appended after the guide rows.
 *
 * ### Label-visibility projection
 *
 * Label visibility lives in several authoritative homes — structure items, the
 * galaxy catalog items (famousGalaxy), the star catalog items (famousStar), the
 * body items (Earth, the planets, the Sun), and the milkyWay scalar. The
 * projection (`projectLabelCategoryVisibility`) merges them into the flat
 * `Record<LabelCategory, boolean>` the row-building memo below reads. The
 * `useMemo` rebuilds only when any of those stable-reference inputs change —
 * each is a per-cluster selector output, never `state.settings` itself, which
 * Immer re-identifies on every write.
 *
 * ### Label dispatch
 *
 * Both directions run off `LABEL_HOME_BY_SOURCE_TYPE`: the category's registry
 * row names its source type, and that type's row knows both where the bit is
 * read from and which action writes it. A new label-bearing source type is a
 * row in that table, not another branch here.
 *
 * ### Row order
 *
 * `LABEL_CATEGORIES` iterates `SOURCE_REGISTRY` in ascending `Source` code
 * order (registry keys are the numeric codes, and JS iterates integer-keyed
 * object properties in ascending order regardless of source-file layout) —
 * there is no separate display-order mechanism, so the panel renders
 * label-bearing categories in registry-code order, then the hand-authored
 * guide rows.
 *
 * ### Why `[dispatch]` only in `useCallback`
 *
 * `dispatch` from `useAppDispatch()` is the invariant `store.dispatch` — it
 * never changes across the component's lifetime. Handlers that close over no
 * store-read values only need `dispatch` in their dep array, giving each
 * handler permanent stable identity and letting the presentational child's
 * `memo` bail correctly on parent re-renders.
 */

import { memo, useCallback, useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import LabelsAndGuidesSection from '../SettingsPanel/LabelsAndGuidesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectStructureItems } from '../../layers/structure/state/structures/selectors';
import { selectGalaxyCatalogItems } from '../../layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { selectStarCatalogItems } from '../../layers/starCatalog/state/starCatalogs/selectors';
import { selectBodyItems } from '../../layers/body/state/bodies/selectors';
import { selectMilkyWayLabelEnabled } from '../../layers/milkyWay/state/milkyWay/selectors';
import { selectOrbitTrailsEnabled } from '../../layers/body/state/orbitTrails/selectors';
import { setOrbitTrailsEnabled } from '../../layers/body/state/orbitTrails/slice';
import { projectLabelCategoryVisibility } from '../../state/settings/projectLabelCategoryVisibility';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../../data/labels/sourceTypeByLabelCategory';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
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

  const structureItems = useAppSelector(selectStructureItems);
  const galaxyCatalogItems = useAppSelector(selectGalaxyCatalogItems);
  const starCatalogItems = useAppSelector(selectStarCatalogItems);
  const bodyItems = useAppSelector(selectBodyItems);
  const milkyWayLabelEnabled = useAppSelector(selectMilkyWayLabelEnabled);
  const orbitTrailsEnabled = useAppSelector(selectOrbitTrailsEnabled);

  // Bundle the label homes, then project them → flat label-visibility record.
  // Both rebuild only when one of the stable-reference inputs changes.
  const labelHomes = useMemo(
    () => ({
      structures: structureItems,
      galaxyCatalogs: galaxyCatalogItems,
      starCatalogs: starCatalogItems,
      bodies: bodyItems,
      milkyWayLabelEnabled,
    }),
    [structureItems, galaxyCatalogItems, starCatalogItems, bodyItems, milkyWayLabelEnabled],
  );

  const labelCategoryVisibility = useMemo(
    () => projectLabelCategoryVisibility(labelHomes),
    [labelHomes],
  );

  // One table lookup, not a per-type chain: the registry row's `type` names the
  // home, and the home knows how to write it.
  const onSetLabelCategoryVisibility = useCallback(
    (category: LabelCategory, enabled: boolean) => {
      dispatch(
        LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[category]].write(category, enabled),
      );
    },
    [dispatch],
  );

  const onToggleOrbitTrails = useCallback(
    (enabled: boolean) => {
      dispatch(setOrbitTrailsEnabled(enabled));
    },
    [dispatch],
  );

  // `shallowEqual` is required: the mapped array is a fresh reference on
  // every store write, which would otherwise re-render this section on any unrelated state change.
  const layerValues = useAppSelector((s) => layerRows.map((row) => row.select(s)), shallowEqual);

  // Every checkbox the section renders, in one uniform shape: the label rows
  // derived from the registry, plus the hand-authored orbitTrails row. There is
  // no other way to build a "rows" array — orbitTrails gates LINE geometry, not
  // labels, so it has no registry row's label axis to derive from and stays
  // hand-authored here. Layer rows are appended last, in composition order.
  const rows: ReadonlyArray<SectionRow> = useMemo(
    () => [
      ...LABEL_CATEGORIES.map((cat) => ({
        id: `toggle-label-${cat}`,
        label: CATEGORY_DISPLAY_INFO[cat].plural,
        enabled: labelCategoryVisibility[cat],
        onChange: (enabled: boolean) => onSetLabelCategoryVisibility(cat, enabled),
      })),
      {
        id: 'toggle-orbit-trails',
        label: 'Orbit trails',
        enabled: orbitTrailsEnabled,
        onChange: onToggleOrbitTrails,
      },
      ...layerRows.map((row, index) => ({
        id: row.id,
        label: row.label,
        enabled: layerValues[index]!,
        onChange: (enabled: boolean) => dispatch(row.set(enabled)),
      })),
    ],
    [
      labelCategoryVisibility,
      onSetLabelCategoryVisibility,
      orbitTrailsEnabled,
      onToggleOrbitTrails,
      layerRows,
      layerValues,
      dispatch,
    ],
  );

  return <LabelsAndGuidesSection rows={rows} />;
}

export default memo(LabelsAndGuidesSectionContainer);
