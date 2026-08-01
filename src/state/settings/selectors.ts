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
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../@types/settings/StarCatalogItemSettings';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../@types/settings/BodyItemSettings';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { MilkyWaySettings } from '../../@types/settings/MilkyWaySettings';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SplineMode } from '../../@types/animation/SplineMode';
import type { PassByDir } from '../../@types/animation/PassByDir';
import type { ClipPathTuningActive } from '../../@types/settings/ClipPathTuningActive';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import type { GalaxyProvenanceSettings } from '../../@types/settings/GalaxyProvenanceSettings';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../data/sources';
import { maskWith } from '../../utils/maskWith';

export const selectSettings = (state: RootState) => state[settingsRoute];

// --- orientation (bare scalar) ------------------------------------------------

/**
 * Camera orientation frame — which astronomical pole is "up". A primitive
 * (string-union) read, so no memoization; the consuming camera code reads it to
 * pick the frame-local-to-world basis from `ORIENTATION_FRAMES`.
 */
export const selectOrientation = (state: RootState): OrientationFrameId =>
  selectSettings(state).orientation;

// --- galaxyCatalogs cluster ---------------------------------------------------

export const selectGalaxyCatalogSize = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.sizePx;

export const selectBrightness = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.brightness;

export const selectDepthFade = (state: RootState): boolean =>
  selectSettings(state).galaxyCatalogs.depthFade;

export const selectGalaxyProvenance = (state: RootState): GalaxyProvenanceSettings =>
  selectSettings(state).galaxyCatalogs.provenance;

/**
 * Overall physical-SB → HDR gain — the "Galaxy brightness" knob. A primitive
 * read, so no memoization. The points draw layer writes it into the
 * `galaxySbScale` uniform each frame.
 */
export const selectGalaxySbScale = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.sbScale;

/**
 * Bloom ceiling — the "Bloom ceiling" knob. A primitive read, so no
 * memoization. The max baked surface-brightness amplitude a galaxy can emit;
 * the vertex stage clamps `sbAmp` to it via the `galaxySbMax` uniform.
 */
export const selectGalaxySbMax = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.sbMax;

/**
 * Readability-falloff exponent — the "Distance falloff" knob. A primitive read,
 * so no memoization. The exponent on the resolved-fraction falloff, gated by
 * the depth-fade toggle; rides the `galaxyFalloffStrength` uniform.
 */
export const selectGalaxyFalloffStrength = (state: RootState): number =>
  selectSettings(state).galaxyCatalogs.falloffStrength;

export const selectGalaxyCatalogItems = (
  state: RootState,
): Record<GalaxyCatalogId, GalaxyCatalogItemSettings> => selectSettings(state).galaxyCatalogs.items;

// --- tonemap cluster ----------------------------------------------------------

export const selectExposure = (state: RootState): number => selectSettings(state).tonemap.exposure;

export const selectToneMapCurve = (state: RootState): ToneMapCurve =>
  selectSettings(state).tonemap.curve;

// --- hdr cluster ----------------------------------------------------------

export const selectHdrEnabled = (state: RootState): boolean => selectSettings(state).hdr.enabled;

export const selectHdrKnee = (state: RootState): number => selectSettings(state).hdr.knee;

export const selectHdrHeadroom = (state: RootState): number => selectSettings(state).hdr.headroom;

// --- bloom cluster ------------------------------------------------------------

export const selectBloomEnabled = (state: RootState): boolean =>
  selectSettings(state).bloom.enabled;

export const selectBloomStrength = (state: RootState): number =>
  selectSettings(state).bloom.strength;

export const selectBloomThreshold = (state: RootState): number =>
  selectSettings(state).bloom.threshold;

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

/**
 * The whole Milky-Way cluster — the slider board needs every tuning leaf at
 * once, and the cluster reference is already stable between writes (Immer's
 * structural sharing), so a bare property read is enough.
 */
export const selectMilkyWay = (state: RootState): MilkyWaySettings =>
  selectSettings(state).milkyWay;

// --- filaments cluster --------------------------------------------------------

export const selectFilamentsEnabled = (state: RootState): boolean =>
  selectSettings(state).filaments.enabled;

export const selectFilamentIntensity = (state: RootState): number =>
  selectSettings(state).filaments.intensity;

// --- constellations cluster ---------------------------------------------------

export const selectConstellationsEnabled = (state: RootState): boolean =>
  selectSettings(state).constellations.enabled;

export const selectConstellationIntensity = (state: RootState): number =>
  selectSettings(state).constellations.intensity;

// --- orbitTrails cluster -------------------------------------------------------

export const selectOrbitTrailsEnabled = (state: RootState): boolean =>
  selectSettings(state).orbitTrails.enabled;

// --- earth cluster ------------------------------------------------------------

export const selectAtmosphereExposure = (state: RootState): number =>
  selectSettings(state).earth.atmosphereExposure;

export const selectAmbientLight = (state: RootState): number =>
  selectSettings(state).earth.ambientLight;

export const selectOceanRoughness = (state: RootState): number =>
  selectSettings(state).earth.oceanRoughness;

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

export const selectShowOrbitTrailImpostor = (state: RootState): boolean =>
  selectSettings(state).debug.showOrbitTrailImpostor;

export const selectDisabledPasses = (state: RootState): Record<string, boolean> =>
  selectSettings(state).debug.disabledPasses;

export const selectClipPathInspectId = (state: RootState): ClipId | null =>
  selectSettings(state).debug.clipPathInspect.clipId;

export const selectClipPathScrub = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.scrub01;

export const selectClipPathAlign = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.align;

export const selectClipPathRampSec = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.rampSec;

export const selectClipPathLinger = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.linger;

export const selectClipPathLingerSec = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.lingerSec;

export const selectClipPathSpline = (state: RootState): SplineMode =>
  selectSettings(state).debug.clipPathInspect.spline;

export const selectClipPathTurnDelay = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.turnDelay;

export const selectClipPathLookAhead = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.lookAhead;

export const selectClipPathPassByOffset = (state: RootState): number =>
  selectSettings(state).debug.clipPathInspect.passByOffset;

export const selectClipPathPassByDir = (state: RootState): PassByDir =>
  selectSettings(state).debug.clipPathInspect.passByDir;

export const selectClipPathTuningActive = (state: RootState): ClipPathTuningActive =>
  selectSettings(state).debug.clipPathInspect.active;

// --- structures cluster -------------------------------------------------------

export const selectStructureItems = (
  state: RootState,
): Record<StructureId, StructureItemSettings> => selectSettings(state).structures.items;

// --- starCatalogs cluster -----------------------------------------------------

/**
 * Passthrough read of the whole star-catalogs cluster (`{ enabled, items }`).
 * Returns the raw Immer-stable reference — no fresh object — so react-redux
 * bails on unrelated writes. The `StarsSectionContainer` needs both the master
 * gate and the per-catalog items, so it reads the cluster once here rather than
 * through two split selectors.
 */
export const selectStarCatalogs = (
  state: RootState,
): {
  enabled: boolean;
  sizePx: number;
  brightness: number;
  refineThreshold: number;
  glowOverlap: number;
  exposureNearX: number;
  exposureMidX: number;
  exposureFarX: number;
  aggregateIntensityCap: number;
  items: Record<StarCatalogId, StarCatalogItemSettings>;
} => selectSettings(state).starCatalogs;

/**
 * The per-catalog item rows alone — the star-catalog twin of
 * `selectGalaxyCatalogItems`. The Labels section bundles it into `LabelHomes`
 * and needs the narrowest stable reference it can get: reading the whole
 * cluster there would rebuild the projection on every star-brightness drag.
 */
export const selectStarCatalogItems = (
  state: RootState,
): Record<StarCatalogId, StarCatalogItemSettings> => selectSettings(state).starCatalogs.items;

// --- bodies cluster -----------------------------------------------------------

/**
 * The per-body item rows — the near-field twin of `selectStarCatalogItems`.
 * The Labels section bundles it into `LabelHomes`; returning the Immer-stable
 * `items` reference (not the cluster, and never `state.settings`) keeps the
 * projection from rebuilding on unrelated writes.
 */
export const selectBodyItems = (state: RootState): Record<BodyId, BodyItemSettings> =>
  selectSettings(state).bodies.items;

/**
 * Star-billboard pixel radius — the star-catalog twin of
 * `selectGalaxyCatalogSize`. A primitive read, so no memoization.
 */
export const selectStarCatalogSize = (state: RootState): number =>
  selectSettings(state).starCatalogs.sizePx;

/**
 * Star-brightness trim — the star-catalog twin of `selectBrightness`. A
 * primitive read, so no memoization. The renderer multiplies the flux-glow
 * peak by it (1.0 = identity).
 */
export const selectStarCatalogBrightness = (state: RootState): number =>
  selectSettings(state).starCatalogs.brightness;

/**
 * Octree-cut refine threshold — the "Detail" knob. A primitive read, so no
 * memoization. Unlike the size/brightness twins this is NOT a GPU uniform: the
 * layer feeds it to `walkStarOctreeCut`. Lower ⇒ boxes split earlier.
 */
export const selectStarCatalogRefineThreshold = (state: RootState): number =>
  selectSettings(state).starCatalogs.refineThreshold;

/**
 * Aggregate glow-overlap spread — the "Glow overlap" knob. A primitive read, so
 * no memoization. The vertex stage multiplies an aggregate's radius by it (and
 * divides the peak by the square, so total luminance is conserved); 1.0 =
 * identity.
 */
export const selectStarCatalogGlowOverlap = (state: RootState): number =>
  selectSettings(state).starCatalogs.glowOverlap;

/**
 * Near-anchor star display exposure — the "Exposure (near)" tuning knob. A
 * primitive read, so no memoization. The layer feeds it (with `exposureFarX`) to
 * `starExposureRamp` each frame; it is the absolute exposure the ramp targets at
 * its near (solar-system) anchor.
 */
export const selectStarCatalogExposureNearX = (state: RootState): number =>
  selectSettings(state).starCatalogs.exposureNearX;

/**
 * Middle-anchor star display exposure — the "Exposure (mid)" tuning knob. A
 * primitive read, so no memoization. The absolute exposure `starExposureRamp`
 * targets at its middle (few-kpc) anchor; pulling it down darkens the
 * intermediate zone without touching either end.
 */
export const selectStarCatalogExposureMidX = (state: RootState): number =>
  selectSettings(state).starCatalogs.exposureMidX;

/**
 * Far-anchor star display exposure — the "Exposure (far)" tuning knob. A
 * primitive read, so no memoization. The absolute exposure `starExposureRamp`
 * targets at its far (whole-galaxy) anchor.
 */
export const selectStarCatalogExposureFarX = (state: RootState): number =>
  selectSettings(state).starCatalogs.exposureFarX;

/**
 * Aggregate surface-brightness cap — the "Fog cap" tuning knob. A primitive
 * read, so no memoization. The ceiling on an AGGREGATE record's per-pixel peak
 * intensity (leaves uncapped); the renderer writes it into the shared star
 * uniform and the vertex stage clamps aggregate peaks to it.
 */
export const selectStarCatalogAggregateIntensityCap = (state: RootState): number =>
  selectSettings(state).starCatalogs.aggregateIntensityCap;

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
