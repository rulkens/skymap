// src/components/containers/LabelsAndGuidesSectionContainer.tsx
/**
 * LabelsAndGuidesSectionContainer — store boundary for the Labels & Guides
 * settings section.
 *
 * Owns all Redux reach for the Labels & Guides group: reads
 * `selectStructureItems`, `selectGalaxyCatalogItems`, and
 * `selectMilkyWayLabelEnabled`, bundles them into the `LabelHomes` the
 * label-projection reads, and wraps the label dispatch in a `useCallback`. It
 * also owns the foreground caption toggles (star / planet names) and the
 * overlay guide rows — constellations (the stick figures, whose name captions
 * ride the same gate) and orbit trails — flat singleton settings that route
 * straight to their own setters. The presentational `LabelsAndGuidesSection`
 * imports nothing from `store/` or `state/`.
 *
 * ### Label-visibility projection
 *
 * Label visibility lives in several authoritative homes — structure items,
 * the galaxy catalog items (famousGalaxy), and the milkyWay scalar. The
 * projection (`projectLabelCategoryVisibility`) merges them into the flat
 * `Record<LabelCategory, boolean>` the section's checkboxes read. The
 * `useMemo` rebuilds only when any of those stable-reference inputs change.
 *
 * ### Label dispatch
 *
 * Both directions run off `LABEL_HOME_BY_SOURCE_TYPE`: the category's registry
 * row names its source type, and that type's row knows both where the bit is
 * read from and which action writes it. A new label-bearing source type is a
 * row in that table, not another branch here.
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
import LabelsAndGuidesSection from '../SettingsPanel/LabelsAndGuidesSection';
import type { NonCategoryRow } from '../SettingsPanel/LabelsAndGuidesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
  selectStarLabelsEnabled,
  selectPlanetLabelsEnabled,
  selectConstellationsEnabled,
  selectOrbitTrailsEnabled,
} from '../../state/settings/selectors';
import {
  setStarLabelsEnabled,
  setPlanetLabelsEnabled,
  setConstellationsEnabled,
  setOrbitTrailsEnabled,
} from '../../state/settings/settingsSlice';
import { projectLabelCategoryVisibility } from '../../state/settings/projectLabelCategoryVisibility';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../../data/labels/sourceTypeByLabelCategory';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

function LabelsAndGuidesSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const structureItems = useAppSelector(selectStructureItems);
  const galaxyCatalogItems = useAppSelector(selectGalaxyCatalogItems);
  const milkyWayLabelEnabled = useAppSelector(selectMilkyWayLabelEnabled);
  const starLabelsEnabled = useAppSelector(selectStarLabelsEnabled);
  const planetLabelsEnabled = useAppSelector(selectPlanetLabelsEnabled);
  const constellationsEnabled = useAppSelector(selectConstellationsEnabled);
  const orbitTrailsEnabled = useAppSelector(selectOrbitTrailsEnabled);

  // Bundle the label homes, then project them → flat label-visibility record.
  // Both rebuild only when one of the stable-reference inputs changes.
  const labelHomes = useMemo(
    () => ({
      structures: structureItems,
      galaxyCatalogs: galaxyCatalogItems,
      milkyWayLabelEnabled,
    }),
    [structureItems, galaxyCatalogItems, milkyWayLabelEnabled],
  );

  const labelCategoryVisibility = useMemo(
    () => projectLabelCategoryVisibility(labelHomes),
    [labelHomes],
  );

  // One table lookup replaces the former three-way chain. The registry row's
  // `type` names the home; the home knows how to write it.
  const onSetLabelCategoryVisibility = useCallback(
    (category: LabelCategory, enabled: boolean) => {
      dispatch(
        LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[category]].write(category, enabled),
      );
    },
    [dispatch],
  );

  const onSetStarLabelsEnabled = useCallback(
    (enabled: boolean) => {
      dispatch(setStarLabelsEnabled(enabled));
    },
    [dispatch],
  );

  const onSetPlanetLabelsEnabled = useCallback(
    (enabled: boolean) => {
      dispatch(setPlanetLabelsEnabled(enabled));
    },
    [dispatch],
  );

  const onToggleConstellations = useCallback(
    (enabled: boolean) => {
      dispatch(setConstellationsEnabled(enabled));
    },
    [dispatch],
  );

  const onToggleOrbitTrails = useCallback(
    (enabled: boolean) => {
      dispatch(setOrbitTrailsEnabled(enabled));
    },
    [dispatch],
  );

  // The non-category boolean rows the section renders + folds into its master
  // tri-state, in render order (star names, planet names, constellations,
  // orbit trails). Assembling the array here keeps the section free of any
  // per-row prop plumbing: a new row is one more entry, not a fresh prop pair
  // threaded through both components. Each `id` is the checkbox element id
  // (preserved verbatim from the former inline rows). The constellations row
  // governs both the stick figures and their name captions — there is no
  // separate names toggle.
  const nonCategoryRows: ReadonlyArray<NonCategoryRow> = useMemo(
    () => [
      {
        id: 'toggle-label-stars',
        label: 'Star names',
        enabled: starLabelsEnabled,
        onChange: onSetStarLabelsEnabled,
      },
      {
        id: 'toggle-label-planets',
        label: 'Planet names',
        enabled: planetLabelsEnabled,
        onChange: onSetPlanetLabelsEnabled,
      },
      {
        id: 'toggle-constellations',
        label: 'Constellations',
        enabled: constellationsEnabled,
        onChange: onToggleConstellations,
      },
      {
        id: 'toggle-orbit-trails',
        label: 'Orbit trails',
        enabled: orbitTrailsEnabled,
        onChange: onToggleOrbitTrails,
      },
    ],
    [
      starLabelsEnabled,
      onSetStarLabelsEnabled,
      planetLabelsEnabled,
      onSetPlanetLabelsEnabled,
      constellationsEnabled,
      onToggleConstellations,
      orbitTrailsEnabled,
      onToggleOrbitTrails,
    ],
  );

  return (
    <LabelsAndGuidesSection
      labelCategoryVisibility={labelCategoryVisibility}
      onSetLabelCategoryVisibility={onSetLabelCategoryVisibility}
      nonCategoryRows={nonCategoryRows}
    />
  );
}

export default memo(LabelsAndGuidesSectionContainer);
