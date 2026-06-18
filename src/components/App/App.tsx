/**
 * App — the root React component for Skymap.
 *
 * Boundary between the imperative WebGPU engine and the React UI.  Its
 * job is wiring: pull state out of focused hooks in `src/hooks/`, hand
 * it to presentational children, and forward user input back into the
 * engine.
 *
 * `handleRef` is a ref, not state: many hooks call methods on the
 * engine, and putting the handle in state would re-render every
 * consumer when it starts up.  `useEngine` writes once, everyone reads.
 *
 * No `React.StrictMode`: the engine creates GPU resources, starts a
 * render loop, and attaches listeners — it isn't designed for the
 * synthetic double-mount.  `useEngine`'s cleanup still runs on real
 * unmounts.
 */

import { useCallback, useMemo, useState } from 'react';
import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useStructureMemberCount } from '../../hooks/useStructureMemberCount';
import { useSplash } from '../../hooks/useSplash';
import { StatusBar } from '../StatusBar/StatusBar';
import { LoadingBar } from '../LoadingBar/LoadingBar';
import InfoCard from '../InfoCard/InfoCard';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import NavigationPanel from '../NavigationPanel/NavigationPanel';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import SearchTrigger from '../SearchTrigger/SearchTrigger';
import AutoRotateToggle from '../AutoRotateToggle/AutoRotateToggle';
import HomeButton from '../HomeButton/HomeButton';
import Splash from '../Splash/Splash';
import AboutPill from '../Splash/AboutPill';
import { MILKY_WAY_INFO } from '../../data/milkyWay/milkyWayInfo';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import appStyles from './App.module.css';
import { useUrlSync } from '../../hooks/useUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import { selectGalaxyCatalogSize } from '../../services/engine/settingsStore/selectors/selectGalaxyCatalogSize';
import { selectDepthFade } from '../../services/engine/settingsStore/selectors/selectDepthFade';
import { selectHighlightFallback } from '../../services/engine/settingsStore/selectors/selectHighlightFallback';
import { selectRealOnly } from '../../services/engine/settingsStore/selectors/selectRealOnly';
import { selectVisibleSourceMask } from '../../services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { selectToneMapCurve } from '../../services/engine/settingsStore/selectors/selectToneMapCurve';
import { selectAutoRotate } from '../../services/engine/settingsStore/selectors/selectAutoRotate';
import { selectBiasMode } from '../../services/engine/settingsStore/selectors/selectBiasMode';
import { selectAbsMagLimit } from '../../services/engine/settingsStore/selectors/selectAbsMagLimit';
import { selectTier } from '../../services/engine/settingsStore/selectors/selectTier';
import { selectShowPickBuffer } from '../../services/engine/settingsStore/selectors/selectShowPickBuffer';
import { selectShowDiskRadiusRing } from '../../services/engine/settingsStore/selectors/selectShowDiskRadiusRing';
import { selectDisabledPasses } from '../../services/engine/settingsStore/selectors/selectDisabledPasses';
import { selectFilamentsEnabled } from '../../services/engine/settingsStore/selectors/selectFilamentsEnabled';
import { selectFilamentIntensity } from '../../services/engine/settingsStore/selectors/selectFilamentIntensity';
import { selectVolumesEnabled } from '../../services/engine/settingsStore/selectors/selectVolumesEnabled';
import { selectVolumeFieldItems } from '../../services/engine/settingsStore/selectors/selectVolumeFieldItems';
import { selectFlow } from '../../services/engine/settingsStore/selectors/selectFlow';
import { selectStructureItems } from '../../services/engine/settingsStore/selectors/selectStructureItems';
import { selectGalaxyCatalogItems } from '../../services/engine/settingsStore/selectors/selectGalaxyCatalogItems';
import { selectMilkyWayLabelEnabled } from '../../services/engine/settingsStore/selectors/selectMilkyWayLabelEnabled';
import { projectVolumeFieldRows } from '../../services/engine/settingsStore/projectVolumeFieldRows';
import { projectMarkerCategoryVisibility } from '../../services/engine/settingsStore/projectMarkerCategoryVisibility';
import { projectLabelCategoryVisibility } from '../../services/engine/settingsStore/projectLabelCategoryVisibility';
import { seedVolumeFields } from '../../data/volume/volumeFieldDefaults';
import {
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_FLOW,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
} from '../../data/defaults';
import { Source, SOURCE_REGISTRY } from '../../data/sources';
import { ALL_VISIBLE_MASK } from '../../utils/allVisibleMask';
import { buildStaticAnchorStructures } from '../../data/structure/buildStaticAnchorStructures';
import { isStructureId, STRUCTURE_IDS } from '../../data/structure/structureIds';
import { GALAXY_CATALOG_IDS } from '../../data/galaxyCatalog/galaxyCatalogIds';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import { DebugPanel } from '../DebugPanel/DebugPanel';

/**
 * Stable fallback for the volume-field items selector during the null-store
 * window (before `handleRef` lands). `useSettingsStore` feeds this into
 * `getSnapshot` and keys a `useCallback` on it, so it MUST be a single stable
 * reference — calling `seedVolumeFields()` inline would mint a fresh object each
 * render and re-fire the subscription. Hoisted to module scope; it's the same
 * construction seed the store starts from, so the first paint matches engine
 * truth.
 */
const VOLUME_FIELD_ITEMS_DEFAULT = seedVolumeFields();

/**
 * Stable fallbacks for the structure / galaxy catalog item selectors during the
 * null-store window (before `handleRef` lands). Same rationale as
 * `VOLUME_FIELD_ITEMS_DEFAULT`: `useSettingsStore` keys a `useCallback` on the
 * fallback, so it MUST be a single stable reference — building either record
 * inline would mint a fresh object each render and re-fire the subscription.
 * Both seed every item to fully visible (`enabled` + `labelEnabled` true),
 * matching the engine's construction default so the first paint of the panel
 * checkboxes matches engine truth.
 */
const STRUCTURE_ITEMS_DEFAULT = Object.fromEntries(
  STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
) as Record<StructureId, StructureItemSettings>;
const GALAXY_CATALOG_ITEMS_DEFAULT = Object.fromEntries(
  GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;

/**
 * Stable empty fallback for the renderer-toggle override record during the
 * null-store window. Same single-reference requirement as the records above:
 * `useSettingsStore` returns it as the snapshot until `handleRef` lands, so
 * minting a fresh object inline each render would re-fire the subscription.
 * Empty matches the engine's construction default (no pass disabled at boot).
 */
const DISABLED_PASSES_DEFAULT: Record<string, boolean> = {};

export function App(): React.ReactElement {
  const {
    canvasRef,
    handleRef,
    status,
    hovered,
    selected,
    focused,
    scale,
    sourceCounts,
    structureCounts,
    loadProgress,
    initialTier,
  } = useEngine();

  // Galaxy catalogs-cluster settings read live off the engine-owned store (no React
  // mirror). Each fallback is the same `data/defaults.ts` seed the store is
  // constructed from, so the first paint (before `handleRef` lands) matches
  // engine truth. `visibleSourceMask` is a pure projection of the per-galaxy-catalog
  // `enabled` bits — `ALL_VISIBLE_MASK` is the all-on startup default.
  const pointSize = useSettingsStore(handleRef, selectGalaxyCatalogSize, DEFAULT_POINT_SIZE_PX);
  const depthFadeEnabled = useSettingsStore(handleRef, selectDepthFade, DEFAULT_DEPTH_FADE_ENABLED);
  const highlightFallback = useSettingsStore(
    handleRef,
    selectHighlightFallback,
    DEFAULT_HIGHLIGHT_FALLBACK,
  );
  const realOnlyMode = useSettingsStore(handleRef, selectRealOnly, DEFAULT_REAL_ONLY_MODE);
  const visibleSourceMask = useSettingsStore(handleRef, selectVisibleSourceMask, ALL_VISIBLE_MASK);

  // Tonemap cluster reads live off the engine-owned store too. Exposure has no
  // React consumer today (no slider in the panels), so only the curve dropdown
  // reads here; the store write notifies synchronously, so `setCurve` tracks
  // without an optimistic cell. Fallback is the same `data/defaults.ts` seed.
  const toneMapCurve = useSettingsStore(handleRef, selectToneMapCurve, DEFAULT_TONE_MAP_CURVE);

  // Camera auto-rotate reads live off the engine-owned store too. The toggle's
  // handler dispatches the store action through `handle.camera.setAutoRotate`,
  // which notifies synchronously, so the play/pause icon tracks without an
  // optimistic cell. Fallback is the same `data/defaults.ts` seed.
  const autoRotate = useSettingsStore(handleRef, selectAutoRotate, DEFAULT_AUTO_ROTATE);

  // Bias mode + absolute-magnitude limit read live off the engine-owned store.
  // The mode radio dispatches through `handle.bias.setMode` (which also kicks
  // the async worker re-bake) and the slider through `handle.setAbsMagLimit`;
  // both notify synchronously, so the controls track without an optimistic
  // cell. Fallback is the same `data/defaults.ts` seed.
  const biasMode = useSettingsStore(handleRef, selectBiasMode, DEFAULT_BIAS_MODE);
  const absMagLimit = useSettingsStore(handleRef, selectAbsMagLimit, DEFAULT_ABS_MAG_LIMIT);

  // The live data tier reads off the engine-owned store (no React mirror). The
  // tier dropdown dispatches through `handle.sources.setTier`, which commits to
  // the store synchronously, so the dropdown tracks without an optimistic cell.
  // Fallback is the viewport-derived `initialTier` boot seed — the value the
  // engine itself was constructed with, so the first paint (before `handleRef`
  // lands) matches engine truth.
  const currentTier = useSettingsStore(handleRef, selectTier, initialTier);

  // Debug-overlay toggles (pick buffer + disk-radius ring) read live off the
  // engine-owned store. The DebugPanel checkboxes dispatch through
  // `handle.debug.setShowPickBuffer` / `setShowDiskRadiusRing` (action-backed),
  // which notify synchronously, so the checkbox tracks without an optimistic
  // cell. Fallback is the same `data/defaults.ts` seed the store is built from.
  const showPickBuffer = useSettingsStore(
    handleRef,
    selectShowPickBuffer,
    DEFAULT_SHOW_PICK_BUFFER,
  );
  const showDiskRadiusRing = useSettingsStore(
    handleRef,
    selectShowDiskRadiusRing,
    DEFAULT_SHOW_DISK_RADIUS_RING,
  );
  // Renderer-toggle override set: read live off the store so the checkboxes
  // track engine truth without mirroring the set in component state. Writes go
  // through `handle.debug.passOverrides.setDisabled` (action-backed), which
  // notifies synchronously — same "dispatch + read back via selector" shape as
  // the pick-buffer toggle above.
  const disabledPasses = useSettingsStore(handleRef, selectDisabledPasses, DISABLED_PASSES_DEFAULT);

  // Filaments cluster (toggle + intensity) reads live off the engine-owned
  // store. The SettingsPanel handlers dispatch through `handle.filaments.setEnabled`
  // / `setIntensity` (action-backed; `setEnabled` also drives the fade ramp),
  // which notify synchronously, so the controls track without an optimistic
  // cell. Fallbacks match the store's seed (`SOURCE_REGISTRY[Source.Filaments]`),
  // so first paint (before `handleRef` lands) matches engine truth.
  const filamentsEnabled = useSettingsStore(
    handleRef,
    selectFilamentsEnabled,
    SOURCE_REGISTRY[Source.Filaments].visible,
  );
  const filamentIntensity = useSettingsStore(
    handleRef,
    selectFilamentIntensity,
    SOURCE_REGISTRY[Source.Filaments].intensity,
  );

  // Volumes cluster reads live off the engine-owned store. The master toggle is
  // a primitive boolean (`selectVolumesEnabled`), dispatched by the handle setter
  // alongside the master fade. The per-field rows go through a STABLE-ref read:
  // `selectVolumeFieldItems` returns the underlying `volumes.items` Record (only
  // changes when a field actually changes, unaffected by a master-toggle flip),
  // and the `useMemo` projects it to the debug-filtered `VolumeFieldRowData[]`
  // the panel renders. Building the array inside the selector would mint a fresh
  // array per `getSnapshot`, breaking `useSyncExternalStore`'s stability contract
  // — keying the `useMemo` on the stable `items` ref is what keeps it cheap. The
  // master fallback is the same `data/defaults.ts` seed; the items fallback is
  // the construction seed (`seedVolumeFields()`), so first paint (before
  // `handleRef` lands) matches engine truth.
  const volumesEnabled = useSettingsStore(handleRef, selectVolumesEnabled, DEFAULT_VOLUMES_ENABLED);
  const volumeFieldItems = useSettingsStore(
    handleRef,
    selectVolumeFieldItems,
    VOLUME_FIELD_ITEMS_DEFAULT,
  );
  const volumeFields = useMemo(
    // `debug-*` synthetic fixtures are dropped here so the panel only shows real
    // science volumes (the dev console + handle.volumes.getState() still see them).
    () => projectVolumeFieldRows(volumeFieldItems).filter((f) => !f.id.startsWith('debug-')),
    [volumeFieldItems],
  );

  // Structure / label visibility reads live off the engine-owned store, through
  // the same STABLE-ref pattern as the volume rows. The two flat
  // `Record<Category, boolean>` views the panel renders are DERIVED records, so a
  // selector that built them per call would mint a fresh object each
  // `getSnapshot` and break `useSyncExternalStore`'s stability contract. Instead
  // the selectors return the underlying item Records verbatim
  // (`selectStructureItems` / `selectGalaxyCatalogItems` — stable under copy-on-write,
  // changing only when a category/galaxy catalog row actually changes), and the `useMemo`
  // projections build the marker + label records keyed on those stable refs. The
  // marker axis spans structure categories only; the label axis spans structure
  // categories PLUS the `famousGalaxy` galaxy catalog (its label lives on the galaxy catalog item
  // row), so its projection takes both Records. Fallbacks are the all-visible
  // construction seeds, so first paint matches engine truth before the handle
  // lands.
  const structureItems = useSettingsStore(handleRef, selectStructureItems, STRUCTURE_ITEMS_DEFAULT);
  const galaxyCatalogItems = useSettingsStore(
    handleRef,
    selectGalaxyCatalogItems,
    GALAXY_CATALOG_ITEMS_DEFAULT,
  );
  // The milkyWay label axis is a singleton-overlay scalar (no per-record items
  // row), so it's a plain boolean read fed into the same label projection.
  const milkyWayLabelEnabled = useSettingsStore(
    handleRef,
    selectMilkyWayLabelEnabled,
    DEFAULT_MILKY_WAY_LABEL_ENABLED,
  );
  const markerCategoryVisibility = useMemo(
    () => projectMarkerCategoryVisibility(structureItems),
    [structureItems],
  );
  const labelCategoryVisibility = useMemo(
    () => projectLabelCategoryVisibility(structureItems, galaxyCatalogItems, milkyWayLabelEnabled),
    [structureItems, galaxyCatalogItems, milkyWayLabelEnabled],
  );

  // Flow overlay reads live off the engine-owned store. `selectFlow` returns the
  // stored `settings.flow` object verbatim — referentially stable under
  // copy-on-write, so `getSnapshot` needs no memo. A knob change goes through the
  // handle alone: `handle.flow.set(patch)` dispatches the copy-on-write action
  // (which the store notifies synchronously) AND runs the per-leaf
  // demand/fade/reseed effects, so the controls track without an optimistic cell.
  // Both panels share this. Fallback is the same `DEFAULT_FLOW` seed the store is
  // constructed from, so first paint (before `handleRef` lands) matches engine
  // truth.
  const flow = useSettingsStore(handleRef, selectFlow, DEFAULT_FLOW);
  const onFlowChange = useCallback(
    (patch: Partial<FlowSettings>) => {
      handleRef.current?.flow.set(patch);
    },
    [handleRef],
  );

  // Live "N galaxies" figure for a pinned cluster/SC/void card.  Recomputes
  // on selection / tier swap / catalog landing (`sourceCounts`) / galaxy catalog
  // toggle — null for galaxy selections and famous-galaxy structures.
  const selectedMemberCount = useStructureMemberCount({
    selected,
    engineHandleRef: handleRef,
    tier: currentTier,
    sourceCounts,
    visibleSourceMask,
  });

  // Mobile gets the left-stack panels collapsed on first paint.  Lazy
  // initializer reads `window.innerWidth` exactly once at mount and the
  // setter is intentionally dropped — re-orienting mid-session shouldn't
  // yank the user's expanded panels back closed under them.  SSR-safe
  // fallback: desktop default when `window` is undefined.
  const [initialMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const initialPanelsOpen = !initialMobile;

  // Reactive companion to `initialMobile`: the scale-bar lift must update live
  // when the viewport crosses the breakpoint (rotation), so it reads the
  // `matchMedia`-backed hook rather than the non-reactive one-shot above.
  const isMobile = useIsMobile();

  const [paletteOpen, setPaletteOpen] = useState(false);

  // Stable handlers for the `React.memo`'d SearchTrigger — a fresh
  // inline arrow each render would defeat the memo.
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // `Tab` fades the whole HUD via a single CSS opacity transition on
  // the `.uiStack` wrapper — for screenshots, recordings, or unobstructed
  // orbiting.
  const [uiHidden, setUiHidden] = useState(false);

  // `d` toggles the debug panel.
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  const { famousMeta, ready: famousMetaReady } = useFamousMeta();

  // Splash hook owns visibility, readiness gate (engine + famous-meta),
  // localStorage versioning, deep-link bypass, 8 s Continue-anyway timer,
  // and dismiss/reopen.  See `useSplash.ts` for rationale.
  const splash = useSplash({ status, loadProgress, famousMetaReady });

  const { aliasIndex, aliasMap } = useAliasIndex({
    paletteOpen,
    sourceCounts,
    engineHandleRef: handleRef,
  });

  // Static structure table for the URL drain.  The engine owns the merged
  // list (static anchors + the async bulk cluster catalog), but threading
  // that as a reactive React slice would re-render App on every catalog load.
  // Deep-link arrivals only need the static subset (`#focus=cluster-…` /
  // `supercluster-…` / `void-…`).  `useMemo([])` so the drain effect
  // doesn't re-fire on every render.
  const staticStructures = useMemo(() => buildStaticAnchorStructures(), []);
  useUrlSync({
    focused,
    status,
    sourceCounts,
    famousMeta,
    aliasMap,
    ready: status.kind === 'ready',
    structures: staticStructures,
    engineHandleRef: handleRef,
  });

  useKeyboardShortcuts({
    selected,
    paletteOpen,
    engineHandleRef: handleRef,
    setPaletteOpen,
    setUiHidden,
    setDebugPanelOpen,
  });

  return (
    <>
      {/* The engine takes over this canvas's GPU context; React never
          writes to it after the initial render.  `id="c"` matches the
          fullscreen CSS rule in index.html. */}
      <canvas ref={canvasRef} id="c" aria-hidden={splash.splashVisible || undefined} />

      {/* HUD wrapper.  All overlay chrome lives inside this single
          `<div>` so `Tab` can fade the whole stack via one CSS
          opacity transition.  Splash also forces the HUD hidden. */}
      <div
        className={cx(
          appStyles.uiStack,
          (uiHidden || splash.splashVisible) && appStyles.uiStackHidden,
          selected != null && isMobile && appStyles.hasSelection,
        )}
      >
        {/* Mounted unconditionally; fades itself out when `loadProgress`
            goes null.  Keeps tier-swap first paints from flashing a
            visible mount frame. */}
        <LoadingBar progress={loadProgress} />

        <StatusBar status={status} />
        <InfoCard
          hovered={hovered}
          selected={selected}
          selectedMemberCount={selectedMemberCount}
          onFocus={(target) => handleRef.current?.camera.focusOn(target)}
          onClose={() => handleRef.current?.selection.clear()}
        />
        <ScaleBar scale={scale} />
        {/* Flex column anchored bottom-left.  Children stack upward as
            they're added, so we don't need per-panel `bottom:` math. */}
        <div className={appStyles.leftStack}>
          <NavigationPanel defaultOpen={initialPanelsOpen} isMobile={initialMobile} />
          <SettingsPanel
            defaultOpen={initialPanelsOpen}
            pointSize={pointSize}
            onPointSizeChange={(size) => handleRef.current?.galaxyCatalogs.setSize(size)}
            labelCategoryVisibility={labelCategoryVisibility}
            markerCategoryVisibility={markerCategoryVisibility}
            onSetMarkerCategoryVisibility={(category, visible) => {
              // Marker rows are keyed by StructureId — drive the ring axis
              // on the structures handle.
              handleRef.current?.structures.setItemEnabled(category, visible);
            }}
            onSetLabelCategoryVisibility={(category, visible) => {
              // Label rows have three homes: structure labels drive the
              // structures handle; the milkyWay singleton "You are here" label
              // drives the milkyWay handle; and the curated atlas (famousGalaxy,
              // a galaxy catalog source) routes through the galaxy catalogs
              // handle's label axis. Each guard narrows the union, so the final
              // else lands on the galaxy-catalog label categories.
              if (isStructureId(category)) {
                handleRef.current?.structures.setLabelEnabled(category, visible);
              } else if (category === 'milkyWay') {
                handleRef.current?.milkyWay.setLabelEnabled(visible);
              } else {
                handleRef.current?.galaxyCatalogs.setLabelEnabled(category, visible);
              }
            }}
            // Filaments reads off the engine-owned store (`selectFilamentsEnabled`
            // / `selectFilamentIntensity`); the handle setters dispatch the store
            // action (and `setEnabled` also drives the fade ramp), which notifies
            // synchronously, so the controls stay in sync without an optimistic
            // update.
            filamentsEnabled={filamentsEnabled}
            onFilamentsChange={(enabled) => handleRef.current?.filaments.setEnabled(enabled)}
            filamentIntensity={filamentIntensity}
            onFilamentIntensityChange={(value) => handleRef.current?.filaments.setIntensity(value)}
            depthFadeEnabled={depthFadeEnabled}
            onDepthFadeEnabledChange={(enabled) => {
              handleRef.current?.galaxyCatalogs.setDepthFade(enabled);
            }}
            onResetCamera={() => handleRef.current?.camera.focusOnHome()}
            // Tier swap is owned end-to-end by the engine: `setTier` commits
            // the new tier to the settings store (which `currentTier` reads via
            // `selectTier`), then cancels in-flight loads, re-fetches the
            // tier-suffixed bins, and re-uploads.
            tier={currentTier}
            onTierChange={(tier) => handleRef.current?.sources.setTier(tier)}
            visibleSourceMask={visibleSourceMask}
            sourceCounts={sourceCounts}
            structureCounts={structureCounts}
            // `setVisible` is synchronous: it flips the galaxy catalog's `enabled`
            // flag (single source of truth) and echoes the derived mask back
            // via `onMaskChange` before this handler returns, so the React
            // checkbox stays engine-driven — no optimistic update needed.
            onToggleSource={(source, visible) =>
              handleRef.current?.sources.setVisible(source, visible)
            }
            // Bias mode + absMagLimit read off the engine-owned store
            // (`selectBiasMode` / `selectAbsMagLimit`); the handle setters
            // dispatch the store action (and `setMode` also re-bakes the worker),
            // which notifies synchronously, so the controls stay in sync without
            // an optimistic update. The tone-map curve reads off the store too
            // (`selectToneMapCurve`); `setCurve` dispatches its action likewise.
            biasMode={biasMode}
            onBiasModeChange={(mode) => handleRef.current?.bias.setMode(mode)}
            absMagLimit={absMagLimit}
            // `M` is the conventional astronomy symbol for absolute magnitude.
            onAbsMagLimitChange={(M) => handleRef.current?.bias.setAbsMagLimit(M)}
            toneMapCurve={toneMapCurve}
            onToneMapCurveChange={(curve) => handleRef.current?.tonemap.setCurve(curve)}
            // `volumesEnabled` reads off the engine-owned store
            // (`selectVolumesEnabled`); the handle setter dispatches the
            // action (which notifies synchronously) and drives the master
            // fade, so the toggle tracks without an optimistic cell. The
            // per-field rows read via `selectVolumeFieldItems` + the `useMemo`
            // projection; each per-field setter forwards straight to the
            // engine, whose store write wakes the rows subscription.
            volumesEnabled={volumesEnabled}
            onVolumesEnabledChange={(enabled) =>
              handleRef.current?.volumes.setMasterEnabled(enabled)
            }
            volumeFields={volumeFields}
            onVolumeFieldEnabledChange={(fieldId, enabled) =>
              handleRef.current?.volumes.setEnabled(fieldId, enabled)
            }
            onVolumeFieldIntensityChange={(fieldId, intensity) =>
              handleRef.current?.volumes.setIntensity(fieldId, intensity)
            }
            onVolumeFieldContrastChange={(fieldId, contrast) =>
              handleRef.current?.volumes.setContrast(fieldId, contrast)
            }
            onVolumeFieldDensityScaleChange={(fieldId, densityScale) =>
              handleRef.current?.volumes.setDensityScale(fieldId, densityScale)
            }
            onVolumeFieldTrimChange={(fieldId, trim) =>
              handleRef.current?.volumes.setTrim(fieldId, trim)
            }
            onVolumeFieldExposureChange={(fieldId, exposure) =>
              handleRef.current?.volumes.setExposure(fieldId, exposure)
            }
            onVolumeFieldPaletteChange={(fieldId, paletteId) =>
              handleRef.current?.volumes.setPalette(fieldId, paletteId)
            }
            // Flow has no engine echo — React owns the slice, so `onFlowChange`
            // applies the optimistic patch AND forwards it to the engine handle
            // (same lock-step idiom as filaments, now one patch instead of nine
            // per-knob handlers).
            flow={flow}
            onFlowChange={onFlowChange}
          />
        </div>
        {/* Top-center pill row.  SearchTrigger + the pills share a flex
            wrapper so they fade together when the palette opens. */}
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen || splash.splashVisible} />
          <HomeButton
            onClick={() => handleRef.current?.camera.focusOnHome()}
            hidden={paletteOpen || splash.splashVisible}
          />
          <AutoRotateToggle
            playing={autoRotate}
            onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
            hidden={paletteOpen || splash.splashVisible}
          />
          <AboutPill onClick={splash.reopen} hidden={paletteOpen || splash.splashVisible} />
        </div>
        <CommandPalette
          entries={famousMeta}
          aliasIndex={aliasIndex ?? undefined}
          open={paletteOpen}
          onClose={closePalette}
          onSelect={(id) => handleRef.current?.selection.selectFamous(id)}
          onSelectAlias={(target) => handleRef.current?.selection.selectByAlias(target)}
          // The Milky Way is a first-class FocusableTarget — focus it through
          // the same select → focus path every other target uses.
          onSelectMilkyWay={() => handleRef.current?.camera.focusOn(MILKY_WAY_INFO)}
        />
        {/* `handleRef.current` set means the engine finished constructing,
            so the panel can subscribe to slots without racing. */}
        {debugPanelOpen && handleRef.current && (
          <DebugPanel
            slots={handleRef.current.assetSlots}
            timingService={handleRef.current.debug.timingService}
            passOverrides={handleRef.current.debug.passOverrides}
            disabledPasses={disabledPasses}
            // Orientation-fallback diagnostic toggles — `galaxyCatalogs`
            // setters echo synchronously, so React mirrors engine
            // truth without an optimistic update.
            highlightFallback={highlightFallback}
            realOnlyMode={realOnlyMode}
            onHighlightFallbackChange={(enabled) => {
              handleRef.current?.galaxyCatalogs.setHighlightFallback(enabled);
            }}
            onRealOnlyModeChange={(enabled) => {
              handleRef.current?.galaxyCatalogs.setRealOnly(enabled);
            }}
            showPickBuffer={showPickBuffer}
            onShowPickBufferChange={(enabled) => {
              handleRef.current?.debug.setShowPickBuffer(enabled);
            }}
            showDiskRadiusRing={showDiskRadiusRing}
            onShowDiskRadiusRingChange={(enabled) => {
              handleRef.current?.debug.setShowDiskRadiusRing(enabled);
            }}
            // Flow motion tunables — no engine echo; the shared `onFlowChange`
            // applies the optimistic patch AND forwards it to the handle (same
            // path as the SettingsPanel flow look controls).
            flow={flow}
            onFlowChange={onFlowChange}
          />
        )}
      </div>
      {splash.splashVisible && (
        <Splash
          blocked={splash.blocked}
          canContinueAnyway={splash.canContinueAnyway}
          loadProgress={loadProgress}
          error={splash.error}
          onExplore={splash.dismissExplore}
          // Plan 2 (stub tour) replaces this with the real tour wiring.
          // For now Tour just dismisses like Explore — the splash work
          // ships independently of the tour itinerary.
          onTour={splash.dismissTour}
          onContinueAnyway={splash.dismissExplore}
          onReload={() => window.location.reload()}
        />
      )}
    </>
  );
}
