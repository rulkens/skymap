// src/components/containers/LabelsAndGuidesSectionContainer.tsx
/**
 * LabelsAndGuidesSectionContainer — store boundary for the Labels & Guides
 * settings section.
 *
 * Owns all Redux reach for the Labels & Guides group: reads
 * `selectStructureItems`, `selectGalaxyCatalogItems`, `selectStarCatalogItems`,
 * `selectBodyItems` and `selectMilkyWayLabelEnabled`, bundles them into the
 * `LabelHomes` the label-projection reads, and wraps the label dispatch in a
 * `useCallback`. It also owns the overlay guide rows — constellations (the
 * stick figures, whose name captions ride the same gate), orbit trails, and
 * the zone-of-avoidance band — flat singleton settings that route straight to
 * their own setters. All of it
 * is assembled into one uniform `SectionRow` array; the presentational
 * `LabelsAndGuidesSection` imports nothing from `store/` or `state/` and has
 * no notion of where any row's bit lives.
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
import LabelsAndGuidesSection from '../SettingsPanel/LabelsAndGuidesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectStarCatalogItems,
  selectBodyItems,
  selectMilkyWayLabelEnabled,
  selectConstellationsEnabled,
  selectOrbitTrailsEnabled,
  selectZoneOfAvoidanceEnabled,
  selectZoneOfAvoidanceLabelEnabled,
} from '../../state/settings/selectors';
import {
  setConstellationsEnabled,
  setOrbitTrailsEnabled,
  setZoneOfAvoidanceEnabled,
} from '../../state/settings/settingsSlice';
import { projectLabelCategoryVisibility } from '../../state/settings/projectLabelCategoryVisibility';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../../data/labels/sourceTypeByLabelCategory';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { SectionRow } from '../../@types/components/SectionRow';

function LabelsAndGuidesSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();

  const structureItems = useAppSelector(selectStructureItems);
  const galaxyCatalogItems = useAppSelector(selectGalaxyCatalogItems);
  const starCatalogItems = useAppSelector(selectStarCatalogItems);
  const bodyItems = useAppSelector(selectBodyItems);
  const milkyWayLabelEnabled = useAppSelector(selectMilkyWayLabelEnabled);
  const constellationsEnabled = useAppSelector(selectConstellationsEnabled);
  const orbitTrailsEnabled = useAppSelector(selectOrbitTrailsEnabled);
  const zoneOfAvoidanceEnabled = useAppSelector(selectZoneOfAvoidanceEnabled);
  const zoneOfAvoidanceLabelEnabled = useAppSelector(selectZoneOfAvoidanceLabelEnabled);

  // Bundle the label homes, then project them → flat label-visibility record.
  // Both rebuild only when one of the stable-reference inputs changes.
  const labelHomes = useMemo(
    () => ({
      structures: structureItems,
      galaxyCatalogs: galaxyCatalogItems,
      starCatalogs: starCatalogItems,
      bodies: bodyItems,
      milkyWayLabelEnabled,
      zoneOfAvoidanceLabelEnabled,
    }),
    [
      structureItems,
      galaxyCatalogItems,
      starCatalogItems,
      bodyItems,
      milkyWayLabelEnabled,
      zoneOfAvoidanceLabelEnabled,
    ],
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

  const onToggleZoneOfAvoidance = useCallback(
    (enabled: boolean) => {
      dispatch(setZoneOfAvoidanceEnabled(enabled));
    },
    [dispatch],
  );

  // Every checkbox the section renders, in one uniform shape: the label rows
  // derived from the registry, plus the hand-authored guide rows. There is no
  // other way to build a "rows" array — constellations, orbitTrails, and the
  // zone-of-avoidance band gate LINE/overlay geometry, not labels, so they
  // have no registry row's label axis to derive from and stay hand-authored
  // here (the band's OWN label toggle does derive, via LABEL_CATEGORIES).
  const rows: ReadonlyArray<SectionRow> = useMemo(
    () => [
      ...LABEL_CATEGORIES.map((cat) => ({
        id: `toggle-label-${cat}`,
        label: CATEGORY_DISPLAY_INFO[cat].plural,
        enabled: labelCategoryVisibility[cat],
        onChange: (enabled: boolean) => onSetLabelCategoryVisibility(cat, enabled),
      })),
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
      {
        id: 'toggle-zone-of-avoidance',
        label: 'Zone of Avoidance',
        enabled: zoneOfAvoidanceEnabled,
        onChange: onToggleZoneOfAvoidance,
      },
    ],
    [
      labelCategoryVisibility,
      onSetLabelCategoryVisibility,
      constellationsEnabled,
      onToggleConstellations,
      orbitTrailsEnabled,
      onToggleOrbitTrails,
      zoneOfAvoidanceEnabled,
      onToggleZoneOfAvoidance,
    ],
  );

  return <LabelsAndGuidesSection rows={rows} />;
}

export default memo(LabelsAndGuidesSectionContainer);
