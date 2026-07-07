/**
 * App — the root React component for Skymap.
 *
 * Layout and container-mounting: renders the engine canvas, mounts the HUD
 * chrome (StatusBar, InfoCard, ScaleBar, NavigationPanel, SettingsPanel,
 * CommandPaletteContainer, AutoRotateToggleContainer, DebugPanelContainer, Splash),
 * and wires keyboard shortcuts + URL sync.
 *
 * `handleRef` is a ref, not state: engine hooks call methods on it, and
 * putting the handle in state would re-render every consumer at startup.
 *
 * No `React.StrictMode`: the engine creates GPU resources and starts a render
 * loop — it isn't designed for the synthetic double-mount. `useEngine`'s
 * cleanup still runs on real unmounts.
 *
 * Cinema mode (`?cinema`): the recorder's capture surface. App renders only
 * the canvas + the tour overlay; every other piece of HUD chrome is absent
 * from the DOM, not merely CSS-hidden — see the branch above the main return.
 *
 * Store reach: `selectHoveredFocusable` / `selectSelectedFocusable` drive the
 * InfoCard; `selectPaletteOpen`, `selectUiHidden`, `selectDebugPanelOpen` gate
 * App's own JSX; `selectVisibleSourceMask` + `selectTier` feed
 * `useStructureMemberCount`; and `selectEngineStatus`, `selectScale`,
 * `selectLoadProgress` from the engine slice drive the HUD chrome (StatusBar,
 * ScaleBar, LoadingBar, Splash). The engine count selectors
 * (`selectSourceCounts`, `selectStructureCounts`) are read inside the section
 * containers + hooks, not App. All settings reach lives in the section
 * containers under SettingsPanel.
 */

import { useCallback, useState } from 'react';
import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useStructureMemberCount } from '../../hooks/useStructureMemberCount';
import { StatusBar } from '../StatusBar/StatusBar';
import { LoadingBar } from '../LoadingBar/LoadingBar';
import InfoCard from '../InfoCard/InfoCard';
import { ScaleBar } from '../ScaleBar/ScaleBar';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import NavigationPanel from '../NavigationPanel/NavigationPanel';
import CommandPaletteContainer from '../containers/CommandPaletteContainer';
import SearchTrigger from '../SearchTrigger/SearchTrigger';
import AutoRotateToggleContainer from '../containers/AutoRotateToggleContainer';
import HomeButton from '../HomeButton/HomeButton';
import SplashContainer from '../containers/SplashContainer';
import AboutPill from '../Splash/AboutPill';
import appStyles from './App.module.css';
import { useUrlSync } from '../../hooks/useUrlSync';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectVisibleSourceMask } from '../../state/settings/selectors';
import { selectTier } from '../../state/tier/selectors';
import { selectHoveredFocusable, selectSelectedFocusable } from '../../state/selection/selectors';
import { updateSelectionFocus, clearSelection } from '../../state/selection/selectionSlice';
import { refOf } from '../../services/engine/helpers/refOf';
import DebugPanelContainer from '../containers/DebugPanelContainer';
import TourOverlayContainer from '../containers/TourOverlayContainer';
import TourDebugPillContainer from '../containers/TourDebugPillContainer';
import { hasUrlGate } from '../../utils/url/hasUrlGate';
import { isCinemaMode } from '../../utils/url/isCinemaMode';
import { selectTourActive } from '../../state/tour/selectors';
import {
  selectPaletteOpen,
  selectUiHidden,
  selectDebugPanelOpen,
  selectSplashVisible,
} from '../../state/ui/selectors';
import {
  setPaletteOpen,
  toggleUiHidden,
  toggleDebugPanelOpen,
  reopenSplash,
} from '../../state/ui/uiSlice';
import { selectEngineStatus, selectScale, selectLoadProgress } from '../../state/engine/selectors';

// Temporary `?tour` debug gate for the grand-tour pill. Read once at module
// scope — the search string can't change without a full page reload.
const TOUR_DEBUG_GATE = hasUrlGate('tour');

export function App(): React.ReactElement {
  const { canvasRef, handleRef } = useEngine();

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

  // Engine runtime state from the Redux engine slice.  The engine dispatches
  // these on each lifecycle / scale / progress event; the HUD chrome
  // (StatusBar, ScaleBar, LoadingBar, Splash) reads them here.  Count fields
  // (`sourceCounts`, `structureCounts`) are read directly in their respective
  // containers and hooks — App no longer needs them.
  const status = useAppSelector(selectEngineStatus);
  const scale = useAppSelector(selectScale);
  const loadProgress = useAppSelector(selectLoadProgress);

  // "Home" frames our own galaxy: the Reset-camera button and the Home pill
  // route through the standard focus channel (updateSelectionFocus →
  // watchFocusTweenSaga), so the camera tween, URL hash, and selection state
  // match every other focus. (The palette's Milky-Way row reaches the same
  // state via requestFocus(MILKY_WAY_FOCUS_ID), the deep-link path.) One stable
  // identity keeps the memo'd SettingsPanel / HomeButton from re-rendering.
  const focusMilkyWay = useCallback(
    () => dispatch(updateSelectionFocus({ type: 'milkyWay' })),
    [dispatch],
  );

  // Live "N galaxies" figure for a pinned cluster/SC/void card.  Recomputes
  // on selection / tier swap / catalog landing (`sourceCounts` from engine slice)
  // / galaxy catalog toggle — null for galaxy selections and famous-galaxy
  // structures.
  const selectedMemberCount = useStructureMemberCount({
    selected,
    engineHandleRef: handleRef,
    tier: currentTier,
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

  // Stable handler for the `React.memo`'d SearchTrigger — a fresh
  // inline arrow each render would defeat the memo.
  const openPalette = useCallback(() => dispatch(setPaletteOpen(true)), [dispatch]);

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

  // The full splash state surface lives in `SplashContainer` so its churn
  // re-renders only that subtree. App needs just two facts: whether the splash
  // is up (to hide the HUD stack) and how to reopen it from the About pill.
  const splashVisible = useAppSelector(selectSplashVisible);
  const reopenSplashScreen = useCallback(() => dispatch(reopenSplash()), [dispatch]);

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

  // Cinema mode (`?cinema`) — the recorder's capture surface: the canvas plus
  // the tour overlay (captions + nav), nothing else. The recorder harness
  // screenshots this page, so the HUD chrome must not EXIST in the DOM;
  // CSS-hiding it (the `uiStackHidden` route) would still leave it findable
  // and able to bleed into captures. Every hook above still runs — the
  // engine, URL sync and keyboard wiring are what make the page playable —
  // only the JSX diverges, which also keeps the hook order unconditional.
  //
  // Read per render, unlike the module-scope TOUR_DEBUG_GATE: a module-scope
  // const is frozen at first import, so tests couldn't flip a mocked
  // `isCinemaMode` between cinema and normal renders without module-cache
  // resets. The search string can't change without a full reload, so the two
  // read styles are behaviourally identical at runtime — and App renders on
  // user action, not per frame, so the re-read costs nothing.
  if (isCinemaMode()) {
    return (
      <>
        <canvas ref={canvasRef} id="c" />
        {tourActive && <TourOverlayContainer />}
      </>
    );
  }

  return (
    <>
      {/* The engine takes over this canvas's GPU context; React never
          writes to it after the initial render.  `id="c"` matches the
          fullscreen CSS rule in index.html. */}
      <canvas ref={canvasRef} id="c" aria-hidden={splashVisible || undefined} />

      {/* HUD wrapper.  All overlay chrome lives inside this single
          `<div>` so `Tab` can fade the whole stack via one CSS
          opacity transition.  Splash also forces the HUD hidden. */}
      <div
        className={cx(
          appStyles.uiStack,
          (uiHidden || splashVisible || tourActive) && appStyles.uiStackHidden,
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
          <SettingsPanel defaultOpen={initialPanelsOpen} onResetCamera={focusMilkyWay} />
        </div>
        {/* Top-center pill row.  SearchTrigger + the pills share a flex
            wrapper so they fade together when the palette opens. */}
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen || splashVisible} />
          <HomeButton onClick={focusMilkyWay} hidden={paletteOpen || splashVisible} />
          <AutoRotateToggleContainer hidden={paletteOpen || splashVisible} />
          <AboutPill onClick={reopenSplashScreen} hidden={paletteOpen || splashVisible} />
          {TOUR_DEBUG_GATE && <TourDebugPillContainer hidden={paletteOpen || splashVisible} />}
        </div>
        <CommandPaletteContainer engineHandleRef={handleRef} />
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
      <SplashContainer />
    </>
  );
}
