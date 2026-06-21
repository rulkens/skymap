/**
 * Settings selectors — the single read seam for the RTK settings slice, scoped
 * through `RootState`.
 *
 * One module, not one-file-per-selector: this is the spec's explicit override
 * of the repo's one-function-per-file rule, so the whole settings read surface
 * lives in a single place the call sites import from.
 *
 * The shape follows the base + derived `createSelector` split:
 *
 *  - `selectSettings` is the base selector — it lifts the settings slice out of
 *    `RootState` (`state[settingsRoute]`). Every other selector composes through
 *    it, so the slice route is named exactly once.
 *  - The leaf selectors are plain composed arrows: a primitive field read
 *    (`selectBrightness`) or a raw sub-record passthrough
 *    (`selectGalaxyCatalogItems`). They need no memoization — primitives compare
 *    by value and the passthrough records are Immer-stable references, so
 *    react-redux's reference-equality `useSelector` already bails out of
 *    unrelated re-renders. Wrapping them in `createSelector` would add a memo
 *    layer that buys nothing.
 *  - `selectVisibleSourceMask` is the lone derived selector: it computes a NEW
 *    32-bit mask by iterating the galaxy-catalog sources, so it goes through
 *    `createSelector(selectSettings, …)` to memoize on the settings reference
 *    and hand back a stable number between unrelated writes.
 *
 * Every selector is `RootState`-scoped, so the same function drops into BOTH the
 * React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`) unchanged.
 *
 * The passthrough items selectors (`selectGalaxyCatalogItems`,
 * `selectStructureItems`, `selectVolumeFieldItems`) return the raw
 * `state.<cluster>.items` reference verbatim — never a freshly-built object — so
 * `useSyncExternalStore` / react-redux see a referentially-stable snapshot and
 * the React side projects the display shape via `useMemo`.
 */

import { createSelector } from '@reduxjs/toolkit';
import { settingsRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../data/sources';
import { maskWith } from '../../utils/maskWith';

export const selectSettings = (state: RootState) => state[settingsRoute];

// --- galaxyCatalogs cluster ---------------------------------------------------

export const selectGalaxyCatalogSize = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.sizePx;

export const selectBrightness = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.brightness;

export const selectDepthFade = (state: RootState): boolean =>
  selectSettings(state).galaxyCatalogs.depthFade;

export const selectHighlightFallback = (state: RootState): boolean =>
  selectSettings(state).galaxyCatalogs.highlightFallback;

export const selectRealOnly = (state: RootState): boolean =>
  selectSettings(state).galaxyCatalogs.realOnly;

export const selectGalaxyCatalogItems = (
  state: RootState,
): Record<GalaxyCatalogId, GalaxyCatalogItemSettings> => selectSettings(state).galaxyCatalogs.items;

// --- tonemap cluster ----------------------------------------------------------

export const selectExposure = (state: RootState): number => selectSettings(state).tonemap.exposure;

export const selectToneMapCurve = (state: RootState): ToneMapCurve =>
  selectSettings(state).tonemap.curve;

// --- bias cluster -------------------------------------------------------------

export const selectBiasMode = (state: RootState): BiasMode => selectSettings(state).bias.mode;

export const selectAbsMagLimit = (state: RootState): number =>
  selectSettings(state).bias.absMagLimit;

// --- thumbnails cluster -------------------------------------------------------

export const selectThumbnailsEnabled = (state: RootState): boolean =>
  selectSettings(state).thumbnails.enabled;

// --- milkyWay cluster ---------------------------------------------------------

export const selectMilkyWayEnabled = (state: RootState): boolean =>
  selectSettings(state).milkyWay.enabled;

export const selectMilkyWayLabelEnabled = (state: RootState): boolean =>
  selectSettings(state).milkyWay.labelEnabled;

// --- filaments cluster --------------------------------------------------------

export const selectFilamentsEnabled = (state: RootState): boolean =>
  selectSettings(state).filaments.enabled;

export const selectFilamentIntensity = (state: RootState): number =>
  selectSettings(state).filaments.intensity;

// --- volumes cluster ----------------------------------------------------------

export const selectVolumesEnabled = (state: RootState): boolean =>
  selectSettings(state).volumes.enabled;

export const selectVolumeFieldItems = (
  state: RootState,
): Partial<Record<VolumeFieldId, VolumeFieldSettings>> => selectSettings(state).volumes.items;

// --- flow cluster -------------------------------------------------------------

export const selectFlow = (state: RootState): FlowSettings => selectSettings(state).flow;

// --- debug cluster ------------------------------------------------------------

export const selectShowPickBuffer = (state: RootState): boolean =>
  selectSettings(state).debug.showPickBuffer;

export const selectShowDiskRadiusRing = (state: RootState): boolean =>
  selectSettings(state).debug.showDiskRadiusRing;

export const selectDisabledPasses = (state: RootState): Record<string, boolean> =>
  selectSettings(state).debug.disabledPasses;

export const selectLensingEnabled = (state: RootState): boolean =>
  selectSettings(state).debug.lensingEnabled;

export const selectLensStrengthDeg = (state: RootState): number =>
  selectSettings(state).debug.lensStrengthDeg;

// --- structures cluster -------------------------------------------------------

export const selectStructureItems = (
  state: RootState,
): Record<StructureId, StructureItemSettings> => selectSettings(state).structures.items;

// --- derived ------------------------------------------------------------------

/**
 * selectVisibleSourceMask — projects the per-galaxy-catalog `enabled` bits into
 * the 32-bit galaxy-catalog-visibility bitmask the SettingsPanel checkboxes
 * read.
 *
 * The mask is NOT authoritative state — it is a compiled projection of the
 * per-galaxy-catalog `items[id].enabled` flags, exactly as `deriveSourceMasks`
 * packs its returned `pick` mask. This selector reproduces `pick` (pure intent
 * from the `enabled` flags), not `draw` (intent OR fade-out tail): the panel
 * checkboxes reflect intent only, and the live fade opacity that the `draw`
 * bits depend on is not held in the store. Iterating `GALAXY_CATALOG_SOURCES`
 * (the only codes that own bit positions) in the same order with the same
 * `maskWith` keeps this bit-identical to `deriveSourceMasks`' `pick` output for
 * any given enabled-set.
 *
 * It memoizes on the settings reference (the lone `createSelector` here) so an
 * unrelated store write returns the cached number rather than recomputing.
 */
export const selectVisibleSourceMask = createSelector(selectSettings, (settings) => {
  let mask = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id; the broad
    // `SourceId` typing on `.id` doesn't know that, so the cast is safe.
    const id = SOURCE_REGISTRY[src].id as GalaxyCatalogId;
    if (settings.galaxyCatalogs.items[id].enabled) mask = maskWith(mask, src);
  }
  return mask;
});
