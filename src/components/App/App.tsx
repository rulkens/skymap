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
import AutoRotateToggleContainer from '../containers/AutoRotateToggleContainer';
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
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectGalaxyCatalogSize,
  selectDepthFade,
  selectVisibleSourceMask,
  selectToneMapCurve,
  selectBiasMode,
  selectAbsMagLimit,
  selectFilamentsEnabled,
  selectFilamentIntensity,
  selectVolumesEnabled,
  selectVolumeFieldItems,
  selectFlow,
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
} from '../../state/settings/selectors';
import {
  setGalaxyCatalogSize,
  setDepthFade,
  setFilamentIntensity,
  setAbsMagLimit,
  setToneMapCurve,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  setMilkyWayLabelEnabled,
  setGalaxyCatalogLabelEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogVisible,
  setBiasMode,
  setVolumesEnabled,
  writeVolumeField,
  setFlow,
} from '../../state/settings/settingsSlice';
import { galaxyCatalogIdOf } from '../../utils/galaxyCatalogIdOf';
import { selectTier } from '../../state/tier/selectors';
import { requestTier } from '../../state/tier/requestTier';
import { projectVolumeFieldRows } from '../../state/settings/projectVolumeFieldRows';
import { projectMarkerCategoryVisibility } from '../../state/settings/projectMarkerCategoryVisibility';
import { projectLabelCategoryVisibility } from '../../state/settings/projectLabelCategoryVisibility';
import { buildStaticAnchorStructures } from '../../data/structure/buildStaticAnchorStructures';
import { isStructureId } from '../../data/structure/structureIds';
import DebugPanelContainer from '../containers/DebugPanelContainer';
import { selectPaletteOpen, selectUiHidden, selectDebugPanelOpen } from '../../state/ui/selectors';
import { setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen } from '../../state/ui/uiSlice';

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
  } = useEngine();

  // The tier dropdown dispatches `requestTier` (a command) rather than calling a
  // handle method — the tier saga reacts and runs the transition.
  const dispatch = useAppDispatch();

  // Galaxy catalogs-cluster settings read straight off the RTK settings slice
  // via `useAppSelector`. The store exists before first paint under the
  // `<Provider>`, so no fallback is needed. `visibleSourceMask` is a pure
  // projection of the per-galaxy-catalog `enabled` bits.
  const pointSize = useAppSelector(selectGalaxyCatalogSize);
  const depthFadeEnabled = useAppSelector(selectDepthFade);
  const visibleSourceMask = useAppSelector(selectVisibleSourceMask);

  // Tonemap cluster. Exposure has no React consumer today (no slider in the
  // panels), so only the curve dropdown reads here. Dispatching `setToneMapCurve`
  // updates the store synchronously, so the dropdown tracks without an optimistic
  // cell; `watchWake` wakes the render loop.
  const toneMapCurve = useAppSelector(selectToneMapCurve);

  // Bias mode + absolute-magnitude limit. The mode radio dispatches
  // `setBiasMode`; `watchBiasBake` re-bakes the worker and `watchWake` wakes
  // the loop. The abs-mag slider dispatches `setAbsMagLimit`; store writes are
  // synchronous so both controls track without an optimistic cell.
  const biasMode = useAppSelector(selectBiasMode);
  const absMagLimit = useAppSelector(selectAbsMagLimit);

  // The live data tier, read from the RTK tier slice. The dropdown dispatches
  // the `requestTier` command; the tier saga writes the new tier (the slice
  // value `selectTier` reads) only once the new bins are ready, so the dropdown
  // tracks the engine's committed truth rather than an optimistic guess.
  const currentTier = useAppSelector(selectTier);

  // Filaments cluster (toggle + intensity). Both read off the store. The toggle
  // dispatches `setFilamentsEnabled`; `watchFades` drives the fade ramp. The
  // intensity slider dispatches `setFilamentIntensity`; `watchWake` wakes the
  // loop. Store writes are synchronous so both controls track without an
  // optimistic cell.
  const filamentsEnabled = useAppSelector(selectFilamentsEnabled);
  const filamentIntensity = useAppSelector(selectFilamentIntensity);

  // Volumes cluster. The master toggle is a primitive boolean
  // (`selectVolumesEnabled`); dispatching `setVolumesEnabled` updates the store
  // synchronously and `watchFades` drives the master fade. The per-field rows
  // go through a STABLE-ref read: `selectVolumeFieldItems` returns the
  // underlying `volumes.items` Record (only changes when a field actually
  // changes, unaffected by a master-toggle flip), and the `useMemo` projects
  // it to the debug-filtered `VolumeFieldRowData[]` the panel renders. Building
  // the array inside the selector would mint a fresh array per read, breaking
  // react-redux's reference-equality bail-out — keying the `useMemo` on the
  // stable `items` ref is what keeps it cheap.
  const volumesEnabled = useAppSelector(selectVolumesEnabled);
  const volumeFieldItems = useAppSelector(selectVolumeFieldItems);
  const volumeFields = useMemo(
    // `debug-*` synthetic fixtures are dropped here so the panel only shows real
    // science volumes (the dev console + handle.volumes.getState() still see them).
    () => projectVolumeFieldRows(volumeFieldItems).filter((f) => !f.id.startsWith('debug-')),
    [volumeFieldItems],
  );

  // Structure / label visibility, through the same STABLE-ref pattern as the
  // volume rows. The two flat `Record<Category, boolean>` views the panel
  // renders are DERIVED records, so a selector that built them per call would
  // mint a fresh object each read and break react-redux's reference-equality
  // bail-out. Instead the selectors return the underlying item Records verbatim
  // (`selectStructureItems` / `selectGalaxyCatalogItems` — stable under
  // copy-on-write, changing only when a category/galaxy catalog row actually
  // changes), and the `useMemo` projections build the marker + label records
  // keyed on those stable refs. The marker axis spans structure categories only;
  // the label axis spans structure categories PLUS the `famousGalaxy` galaxy
  // catalog (its label lives on the galaxy catalog item row), so its projection
  // takes both Records.
  const structureItems = useAppSelector(selectStructureItems);
  const galaxyCatalogItems = useAppSelector(selectGalaxyCatalogItems);
  // The milkyWay label axis is a singleton-overlay scalar (no per-record items
  // row), so it's a plain boolean read fed into the same label projection.
  const milkyWayLabelEnabled = useAppSelector(selectMilkyWayLabelEnabled);
  const markerCategoryVisibility = useMemo(
    () => projectMarkerCategoryVisibility(structureItems),
    [structureItems],
  );
  const labelCategoryVisibility = useMemo(
    () => projectLabelCategoryVisibility(structureItems, galaxyCatalogItems, milkyWayLabelEnabled),
    [structureItems, galaxyCatalogItems, milkyWayLabelEnabled],
  );

  // Flow overlay. `selectFlow` returns the stored `settings.flow` object
  // verbatim — referentially stable under copy-on-write, so no memo is needed.
  // A knob change dispatches `setFlow(patch)` directly; the store write is
  // synchronous so the controls track without an optimistic cell.
  // `watchFlowReseed` reseeds on mode/count changes; `watchFades` drives the
  // enable/disable fade. Both panels share this handler.
  const flow = useAppSelector(selectFlow);
  const onFlowChange = useCallback(
    (patch: Partial<FlowSettings>) => {
      dispatch(setFlow(patch));
    },
    [dispatch],
  );

  // Stable reset-camera callback for SettingsPanel's memo to bail on re-renders.
  // `handleRef` is a stable ref — the arrow identity is permanent.
  const onResetCamera = useCallback(() => handleRef.current?.camera.focusOnHome(), [handleRef]);

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

  // paletteOpen / uiHidden / debugPanelOpen are owned by the `ui` slice;
  // keyboard shortcuts dispatch slice actions, not React setters.
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const uiHidden = useAppSelector(selectUiHidden);
  const debugPanelOpen = useAppSelector(selectDebugPanelOpen);

  // Stable handlers for the `React.memo`'d SearchTrigger — a fresh
  // inline arrow each render would defeat the memo.
  const openPalette = useCallback(() => dispatch(setPaletteOpen(true)), [dispatch]);
  const closePalette = useCallback(() => dispatch(setPaletteOpen(false)), [dispatch]);

  // Stable dispatching callbacks for the keyboard hook — wrapped in
  // `useCallback([dispatch])` so the arrow identity is stable for the
  // component lifetime and the effect's dep array stays stable.
  // `useAppDispatch()` returns the invariant `store.dispatch`, so these
  // never trigger re-binds.
  const dispatchSetPaletteOpen = useCallback(
    (open: boolean) => dispatch(setPaletteOpen(open)),
    [dispatch],
  );
  const dispatchToggleUiHidden = useCallback(() => dispatch(toggleUiHidden()), [dispatch]);
  const dispatchToggleDebugPanelOpen = useCallback(
    () => dispatch(toggleDebugPanelOpen()),
    [dispatch],
  );

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
    setPaletteOpen: dispatchSetPaletteOpen,
    toggleUiHidden: dispatchToggleUiHidden,
    toggleDebugPanelOpen: dispatchToggleDebugPanelOpen,
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
            sourceCounts={sourceCounts}
            structureCounts={structureCounts}
            onResetCamera={onResetCamera}
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
          <AutoRotateToggleContainer hidden={paletteOpen || splash.splashVisible} />
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
          <DebugPanelContainer
            slots={handleRef.current.assetSlots}
            timingService={handleRef.current.debug.timingService}
            passNames={handleRef.current.debug.passOverrides.allNames}
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
