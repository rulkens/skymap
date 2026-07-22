// src/components/containers/LabelsSectionContainer.tsx
/**
 * LabelsSectionContainer — store boundary for the Labels settings section.
 *
 * Owns all Redux reach for the Labels group: reads `selectStructureItems`,
 * `selectGalaxyCatalogItems`, and `selectMilkyWayLabelEnabled`, runs the
 * three-input label-projection, and wraps the 3-way dispatch guard in a
 * `useCallback`. It also owns the foreground caption toggles (star / planet
 * names) and the constellation rows (the overlay lines toggle, the figure
 * name-labels toggle, and the intensity slider) — flat singleton settings that
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
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
  selectStarLabelsEnabled,
  selectPlanetLabelsEnabled,
  selectConstellationsEnabled,
  selectConstellationLabelsEnabled,
  selectConstellationIntensity,
} from '../../state/settings/selectors';
import {
  setStructureLabelEnabled,
  setMilkyWayLabelEnabled,
  setGalaxyCatalogLabelEnabled,
  setStarLabelsEnabled,
  setPlanetLabelsEnabled,
  setConstellationsEnabled,
  setConstellationLabelsEnabled,
  setConstellationIntensity,
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
  const constellationLabelsEnabled = useAppSelector(selectConstellationLabelsEnabled);
  const constellationIntensity = useAppSelector(selectConstellationIntensity);

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

  const onSetConstellationLabelsEnabled = useCallback(
    (enabled: boolean) => {
      dispatch(setConstellationLabelsEnabled(enabled));
    },
    [dispatch],
  );

  const onConstellationIntensityChange = useCallback(
    (value: number) => {
      dispatch(setConstellationIntensity(value));
    },
    [dispatch],
  );

  return (
    <LabelsSection
      labelCategoryVisibility={labelCategoryVisibility}
      onSetLabelCategoryVisibility={onSetLabelCategoryVisibility}
      starLabelsEnabled={starLabelsEnabled}
      onSetStarLabelsEnabled={onSetStarLabelsEnabled}
      planetLabelsEnabled={planetLabelsEnabled}
      onSetPlanetLabelsEnabled={onSetPlanetLabelsEnabled}
      constellationsEnabled={constellationsEnabled}
      onToggleConstellations={onToggleConstellations}
      constellationLabelsEnabled={constellationLabelsEnabled}
      onSetConstellationLabelsEnabled={onSetConstellationLabelsEnabled}
      constellationIntensity={constellationIntensity}
      onConstellationIntensityChange={onConstellationIntensityChange}
    />
  );
}

export default memo(LabelsSectionContainer);
