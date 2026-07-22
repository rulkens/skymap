// src/components/containers/LabelsSectionContainer.tsx
/**
 * LabelsSectionContainer — store boundary for the Labels settings section.
 *
 * Owns all Redux reach for the Labels group: reads `selectStructureItems`,
 * `selectGalaxyCatalogItems`, and `selectMilkyWayLabelEnabled`, runs the
 * three-input label-projection, and wraps the 3-way dispatch guard in a
 * `useCallback`. It also owns the foreground caption toggles (star / planet
 * names) and the constellation row (the one overlay toggle that governs both
 * the stick figures and their name captions) — flat singleton settings that
 * route straight to their own setters. The presentational `LabelsSection`
 * imports nothing from `store/` or `state/`.
 *
 * ### Label-visibility projection
 *
 * Label visibility lives in three authoritative homes — structure items,
 * the galaxy catalog items (famousGalaxy), and the milkyWay scalar. The
 * projection (`projectLabelCategoryVisibility`) merges them into the flat
 * `Record<LabelCategory, boolean>` the section's checkboxes read. The
 * `useMemo` rebuilds only when any of those stable-reference inputs change.
 *
 * ### 3-way dispatch guard
 *
 * A label checkbox toggle dispatches to one of three slices based on the
 * category's type:
 *   - structure ids (cluster, supercluster, void, group) → `setStructureLabelEnabled`
 *   - milkyWay singleton overlay → `setMilkyWayLabelEnabled`
 *   - galaxy-catalog label categories (famousGalaxy) → `setGalaxyCatalogLabelEnabled`
 *
 * The guard order is: `isStructureId` → `=== 'milkyWay'` → else (galaxy catalog).
 * This exact order is preserved from App to keep behaviour byte-identical.
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
import LabelsSection from '../SettingsPanel/LabelsSection';
import type { NonCategoryLabelRow } from '../SettingsPanel/LabelsSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
  selectStarLabelsEnabled,
  selectPlanetLabelsEnabled,
  selectConstellationsEnabled,
} from '../../state/settings/selectors';
import {
  setStructureLabelEnabled,
  setMilkyWayLabelEnabled,
  setGalaxyCatalogLabelEnabled,
  setStarLabelsEnabled,
  setPlanetLabelsEnabled,
  setConstellationsEnabled,
} from '../../state/settings/settingsSlice';
import { projectLabelCategoryVisibility } from '../../state/settings/projectLabelCategoryVisibility';
import { isStructureId } from '../../data/structure/structureIds';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

function LabelsSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const structureItems = useAppSelector(selectStructureItems);
  const galaxyCatalogItems = useAppSelector(selectGalaxyCatalogItems);
  const milkyWayLabelEnabled = useAppSelector(selectMilkyWayLabelEnabled);
  const starLabelsEnabled = useAppSelector(selectStarLabelsEnabled);
  const planetLabelsEnabled = useAppSelector(selectPlanetLabelsEnabled);
  const constellationsEnabled = useAppSelector(selectConstellationsEnabled);

  // Project items → flat label-visibility record. Rebuilds only when any of the
  // three stable-reference inputs change.
  const labelCategoryVisibility = useMemo(
    () => projectLabelCategoryVisibility(structureItems, galaxyCatalogItems, milkyWayLabelEnabled),
    [structureItems, galaxyCatalogItems, milkyWayLabelEnabled],
  );

  // 3-way dispatch guard. Narrowing order: structure → milkyWay → galaxy catalog
  // (else branch covers famousGalaxy and any future label-bearing galaxy catalog
  // sources).
  const onSetLabelCategoryVisibility = useCallback(
    (category: LabelCategory, enabled: boolean) => {
      if (isStructureId(category)) {
        dispatch(setStructureLabelEnabled({ id: category, enabled }));
      } else if (category === 'milkyWay') {
        dispatch(setMilkyWayLabelEnabled(enabled));
      } else {
        dispatch(setGalaxyCatalogLabelEnabled({ id: category, enabled }));
      }
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

  // The non-category boolean rows the section renders + folds into its master
  // tri-state, in render order (star names, planet names, constellations).
  // Assembling the array here keeps the section free of any per-row prop
  // plumbing: a new caption row is one more entry, not a fresh prop pair
  // threaded through both components. Each `id` is the checkbox element id
  // (preserved verbatim from the former inline rows). The constellations row
  // governs both the stick figures and their name captions — there is no
  // separate names toggle.
  const nonCategoryRows: ReadonlyArray<NonCategoryLabelRow> = useMemo(
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
    ],
    [
      starLabelsEnabled,
      onSetStarLabelsEnabled,
      planetLabelsEnabled,
      onSetPlanetLabelsEnabled,
      constellationsEnabled,
      onToggleConstellations,
    ],
  );

  return (
    <LabelsSection
      labelCategoryVisibility={labelCategoryVisibility}
      onSetLabelCategoryVisibility={onSetLabelCategoryVisibility}
      nonCategoryRows={nonCategoryRows}
    />
  );
}

export default memo(LabelsSectionContainer);
