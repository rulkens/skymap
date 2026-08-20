/**
 * App — the root React component for Skymap.
 *
 * Layout and container-mounting: renders the engine canvas and mounts the HUD
 * chrome as leaf container components — LoadingBarContainer, StatusBarContainer,
 * InfoCardContainer, ScaleBarContainer, TimeBarContainer, NavigationPanelContainer,
 * SettingsPanelContainer, TopBarContainer, CommandPaletteContainer,
 * SplashContainer, and `DebugPanel` (memo-boundary, its sections mount their
 * own containers).
 * Each container owns its own store reach; App just arranges them.
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
 * Store reach: App itself keeps only shell-level reach. `selectSelectedFocusable`
 * drives the `uiStack` "has a pinned mobile selection" className;
 * `selectPaletteOpen`, `selectUiHidden`,
 * `selectDebugPanelOpen`, `selectSplashVisible` gate App's own JSX; and
 * `selectTourActive` picks the tour-overlay/beat-rail branch. Everything
 * else — hover/selection detail, engine status/scale/load-progress, settings,
 * navigation, the top-pill row's dispatches — is owned by the container it
 * feeds, not App.
 */

import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { useIsMobile } from '../../hooks/useIsMobile';
import LoadingBarContainer from '../containers/LoadingBarContainer';
import StatusBarContainer from '../containers/StatusBarContainer';
import InfoCardContainer from '../containers/InfoCardContainer';
import ScaleBarContainer from '../containers/ScaleBarContainer';
import NavigationPanelContainer from '../containers/NavigationPanelContainer';
import SettingsPanelContainer from '../containers/SettingsPanelContainer';
import TopBarContainer from '../containers/TopBarContainer';
import CommandPaletteContainer from '../containers/CommandPaletteContainer';
import TimeBarContainer from '../containers/TimeBarContainer';
import SplashContainer from '../containers/SplashContainer';
import appStyles from './App.module.css';
import { useAppSelector } from '../../store/hooks';
import { selectSelectedFocusable } from '../../state/selection/selectors';
import DebugPanel from '../DebugPanel/DebugPanel';
import TourOverlayContainer from '../containers/TourOverlayContainer';
import TourBeatRailContainer from '../containers/TourBeatRailContainer';
import { isCinemaMode } from '../../utils/url/isCinemaMode';
import { selectTourActive } from '../../state/tour/selectors';
import {
  selectPaletteOpen,
  selectUiHidden,
  selectDebugPanelOpen,
  selectSplashVisible,
} from '../../state/ui/selectors';

export function App(): React.ReactElement {
  const { canvasRef, handleRef } = useEngine();

  // The only selection-slice read App keeps: it drives the `uiStack`
  // "pinned selection on mobile" className. All other selection reach (hover,
  // InfoCard detail, member count) lives in InfoCardContainer.
  const selected = useAppSelector(selectSelectedFocusable);

  // Reactive companion to the containers' one-shot `useInitialMobile`: the
  // `hasSelection` className must update live when the viewport crosses the
  // breakpoint (rotation), so it reads the `matchMedia`-backed hook.
  const isMobile = useIsMobile();

  // paletteOpen / uiHidden / debugPanelOpen are owned by the `ui` slice; App
  // reads them only to gate its own render (TimeBar visibility, HUD fade,
  // DebugPanel mount).
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const uiHidden = useAppSelector(selectUiHidden);
  const debugPanelOpen = useAppSelector(selectDebugPanelOpen);

  // A running guided tour hides the whole HUD stack and mounts its own overlay
  // (caption + nav). HUD-hidden-during-tour is DERIVED from `tour.active`, not a
  // separate `setUiHidden` write — see guidedTourSaga's "no setUiHidden" note.
  const tourActive = useAppSelector(selectTourActive);

  // The full splash state surface lives in `SplashContainer` so its churn
  // re-renders only that subtree. App needs just one fact: whether the splash
  // is up (to hide the HUD stack / gate TimeBar / mark the canvas inert).
  const splashVisible = useAppSelector(selectSplashVisible);

  // Shared between BOTH return branches (cinema + normal) so the `id="c"`
  // contract and the mount-only-while-touring rule each live in one place.
  //
  // The engine takes over this canvas's GPU context; React never writes to it
  // after the initial render. `id="c"` matches the fullscreen CSS rule in
  // index.html. `aria-hidden` is inert in cinema mode — gate 0 of
  // buildInitialUiState pins the splash hidden there, so it stays undefined.
  const canvas = <canvas ref={canvasRef} id="c" aria-hidden={splashVisible || undefined} />;
  // Tour overlay (caption + nav) — mounted only while a tour runs. In the
  // normal branch it sits as a SIBLING of the HUD stack, not inside it, so the
  // `uiStackHidden` fade (which the tour triggers) doesn't also fade it.
  const tourOverlay = tourActive && <TourOverlayContainer />;

  // Cinema mode (`?cinema`) — the recorder's capture surface: the canvas plus
  // the tour overlay (captions + nav), nothing else. The recorder harness
  // screenshots this page, so the HUD chrome must not EXIST in the DOM;
  // CSS-hiding it (the `uiStackHidden` route) would still leave it findable
  // and able to bleed into captures. Every hook above still runs — `useEngine`
  // is what makes the page playable — only the JSX diverges, which also keeps
  // the hook order unconditional.
  if (isCinemaMode()) {
    return (
      <>
        {canvas}
        {tourOverlay}
      </>
    );
  }

  return (
    <>
      {canvas}

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
        <LoadingBarContainer />
        <StatusBarContainer />
        <InfoCardContainer engineHandleRef={handleRef} />
        <ScaleBarContainer />
        {/* Self-positioning (fixed, bottom-center) — rides the HUD stack as a
            direct child rather than joining a flex row. */}
        <TimeBarContainer hidden={paletteOpen || splashVisible} />
        {/* Flex column anchored bottom-left. */}
        <div className={appStyles.leftStack}>
          <NavigationPanelContainer />
          <SettingsPanelContainer />
        </div>
        <TopBarContainer />
        <CommandPaletteContainer engineHandleRef={handleRef} />
        {/* `handleRef.current` set means the engine finished constructing,
            so the panel can subscribe to slots without racing. */}
        {debugPanelOpen && handleRef.current && (
          <DebugPanel
            slots={handleRef.current.assetSlots}
            timingService={handleRef.current.debug.timingService}
            frameStats={handleRef.current.debug.frameStats}
            passNames={handleRef.current.debug.passOverrides.allNames}
            assetPriorities={handleRef.current.debug.assetPriorities}
            earthTileDebug={handleRef.current.debug.earthTiles}
            flyToLonLat={handleRef.current.debug.flyToLonLat}
          />
        )}
      </div>
      {tourOverlay}
      {/* Beat rail rides the interactive session only — it is progress
          chrome, so the cinema branch (captions-only film frames) omits it
          just like TourNav and the beat counter. */}
      {tourActive && <TourBeatRailContainer />}
      <SplashContainer />
    </>
  );
}
