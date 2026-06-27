/**
 * App — the root React component for Skymap.
 *
 * Layout and container-mounting: renders the engine canvas, mounts the HUD
 * chrome (StatusBar, InfoCard, ScaleBar, NavigationPanel, SettingsPanel,
 * CommandPalette, AutoRotateToggleContainer, DebugPanelContainer, Splash),
 * and wires keyboard shortcuts + URL sync.
 *
 * `handleRef` is a ref, not state: engine hooks call methods on it, and
 * putting the handle in state would re-render every consumer at startup.
 *
 * No `React.StrictMode`: the engine creates GPU resources and starts a render
 * loop — it isn't designed for the synthetic double-mount. `useEngine`'s
 * cleanup still runs on real unmounts.
 *
 * Store reach is intentionally minimal: `selectHoveredFocusable` /
 * `selectSelectedFocusable` drive the InfoCard; `selectPaletteOpen`,
 * `selectUiHidden`, `selectDebugPanelOpen` gate App's own JSX; and
 * `selectVisibleSourceMask` + `selectTier` feed `useStructureMemberCount`. All
 * settings reach lives in the section containers under SettingsPanel.
 */

import { useCallback, useState } from 'react';
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
import appStyles from './App.module.css';
import { useUrlSync } from '../../hooks/useUrlSync';
import { useFamousMeta } from '../../hooks/useFamousMeta';
import { useAliasIndex } from '../../hooks/useAliasIndex';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectVisibleSourceMask } from '../../state/settings/selectors';
import { selectTier } from '../../state/tier/selectors';
import { selectHoveredFocusable, selectSelectedFocusable } from '../../state/selection/selectors';
import { updateSelectionFocus, clearSelection } from '../../state/selection/selectionSlice';
import { requestFocus } from '../../state/selection/requestFocus';
import { refOf } from '../../services/engine/helpers/refOf';
import type { GalaxyCatalogSourceType } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import DebugPanelContainer from '../containers/DebugPanelContainer';
import TourOverlayContainer from '../containers/TourOverlayContainer';
import { selectTourActive } from '../../state/tour/selectors';
import { selectPaletteOpen, selectUiHidden, selectDebugPanelOpen } from '../../state/ui/selectors';
import { setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen } from '../../state/ui/uiSlice';

export function App(): React.ReactElement {
  const { canvasRef, handleRef, status, scale, sourceCounts, structureCounts, loadProgress } =
    useEngine();

  // Dispatch drives selection commands (InfoCard / CommandPalette) plus the
  // palette/ui/debug toggle actions fired from the keyboard hook and the
  // inline chrome callbacks below.
  const dispatch = useAppDispatch();

  // Selection slots — read from the Redux store. The engine dispatches
  // `updateSelectionHover/Select/Focus` directly; these selectors build
  // the rich `FocusableTarget` display models from the resolved row cache.
  const hovered = useAppSelector(selectHoveredFocusable);
  const selected = useAppSelector(selectSelectedFocusable);

  // `visibleSourceMask` and `currentTier` are the only settings/tier-slice
  // reads App keeps: both feed `useStructureMemberCount` for the InfoCard
  // member-count. All other settings reach lives in the section containers
  // under SettingsPanel.
  const visibleSourceMask = useAppSelector(selectVisibleSourceMask);
  const currentTier = useAppSelector(selectTier);

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

  // A running guided tour hides the whole HUD stack and mounts its own overlay
  // (caption + nav). HUD-hidden-during-tour is DERIVED from `tour.active`, not a
  // separate `setUiHidden` write — see guidedTourSaga's "no setUiHidden" note.
  const tourActive = useAppSelector(selectTourActive);

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

  const { aliasIndex } = useAliasIndex({
    paletteOpen,
    sourceCounts,
    engineHandleRef: handleRef,
  });

  // Deep-link hash read + URL write. Reads focus from the store directly;
  // dispatches `requestFocus` / `clearSelection` for hash changes.
  useUrlSync();

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
          (uiHidden || splash.splashVisible || tourActive) && appStyles.uiStackHidden,
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
          onFocus={(target) => dispatch(updateSelectionFocus(refOf(target)))}
          onClose={() => dispatch(clearSelection())}
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
          onSelect={(id) => dispatch(requestFocus(id))}
          onSelectAlias={(target) =>
            dispatch(
              updateSelectionFocus({
                type: 'galaxyCatalog',
                source: target.source as GalaxyCatalogSourceType,
                index: target.localIdx,
              }),
            )
          }
          // The Milky Way is a first-class FocusableTarget — focus it through
          // the same select → focus path every other target uses.
          onSelectMilkyWay={() => dispatch(updateSelectionFocus({ type: 'milkyWay' }))}
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
      {/* Tour overlay — sibling of the HUD stack, not inside it, so the
          `uiStackHidden` fade (which the tour triggers) doesn't also fade the
          caption + nav. Mounted only while a tour runs. */}
      {tourActive && <TourOverlayContainer />}
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
