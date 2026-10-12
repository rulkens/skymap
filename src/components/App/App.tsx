/**
 * App — the root component: the engine canvas plus the HUD, mounted as leaf
 * containers that each own their store reach. On a phone the card, scale, time
 * and panels give way to PhoneHudContainer. `handleRef` is a ref, not state, so
 * the engine handle doesn't re-render every consumer at startup. No
 * `React.StrictMode`: the engine's GPU resources and render loop can't survive
 * the synthetic double-mount. Cinema mode (`?cinema`, the recorder's surface)
 * renders only canvas + tour overlay; the rest is absent from the DOM.
 */

import { Suspense } from 'react';
import cx from 'classnames';
import { useEngine } from '../../hooks/useEngine';
import { useIsMobile } from '../../hooks/useIsMobile';
import LoadingBarContainer from '../containers/LoadingBarContainer';
import StatusBarContainer from '../containers/StatusBarContainer';
import ScaleBarContainer from '../containers/ScaleBarContainer';
import NavigationPanelContainer from '../containers/NavigationPanelContainer';
import TopBarContainer from '../containers/TopBarContainer';
import TimeBarContainer from '../containers/TimeBarContainer';
import PhoneHudContainer from '../containers/PhoneHudContainer';
import SplashContainer from '../containers/SplashContainer';
import LazyInfoCardContainer from '../containers/LazyInfoCardContainer';
import LazySettingsPanelContainer from '../containers/LazySettingsPanelContainer';
import LazyCommandPaletteContainer from '../containers/LazyCommandPaletteContainer';
import LazyDebugPanelContainer from '../containers/LazyDebugPanelContainer';
import ArrivalVeilContainer from '../containers/ArrivalVeilContainer';
import appStyles from './App.module.css';
import { useAppSelector } from '../../store/hooks';
import TourOverlayContainer from '../containers/TourOverlayContainer';
import TourBeatRailContainer from '../containers/TourBeatRailContainer';
import ExhibitOverlayContainer from '../containers/ExhibitOverlayContainer';
import { isCinemaMode } from '../../utils/url/isCinemaMode';
import { selectTourActive } from '../../state/tour/selectors';
import { selectTakeoverSource } from '../../state/takeover/selectors';
import {
  selectPaletteOpen,
  selectUiHidden,
  selectDebugPanelOpen,
  selectSplashVisible,
} from '../../state/ui/selectors';

export function App(): React.ReactElement {
  const { canvasRef, handleRef } = useEngine();

  // matchMedia-backed, so the HUDs swap live on rotation.
  const isMobile = useIsMobile();

  const paletteOpen = useAppSelector(selectPaletteOpen);
  const uiHidden = useAppSelector(selectUiHidden);
  const debugPanelOpen = useAppSelector(selectDebugPanelOpen);

  // A running tour or exhibit hides the HUD stack (derived, not a `setUiHidden`
  // write). A registry clip keeps the HUD: the debug panel's Stop must stay in reach.
  const tourActive = useAppSelector(selectTourActive);

  const takeoverSource = useAppSelector(selectTakeoverSource);
  const exhibitId = takeoverSource?.kind === 'exhibit' ? takeoverSource.id : null;

  // Only "is it up" lives here; the rest of the splash state stays in SplashContainer.
  const splashVisible = useAppSelector(selectSplashVisible);

  // Shared by both return branches. The engine owns this canvas's GPU context;
  // `id="c"` matches the fullscreen CSS rule in index.html.
  const canvas = <canvas ref={canvasRef} id="c" aria-hidden={splashVisible || undefined} />;
  // A sibling of the HUD stack, not inside it: the tour's own `uiStackHidden` fade must not fade it.
  const tourOverlay = tourActive && <TourOverlayContainer />;
  const exhibitOverlay = exhibitId && <ExhibitOverlayContainer id={exhibitId} />;

  // The HUD must not exist in the DOM here: CSS-hiding could bleed into captures.
  // Every hook above still runs (`useEngine` makes the page playable); only the JSX diverges.
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

      {/* One wrapper so `Tab` fades the whole stack with a single opacity transition. */}
      <div
        className={cx(
          appStyles.uiStack,
          (uiHidden || splashVisible || tourActive || exhibitId !== null) &&
            appStyles.uiStackHidden,
        )}
      >
        <LoadingBarContainer />
        <StatusBarContainer />
        {isMobile ? (
          <PhoneHudContainer hidden={paletteOpen || splashVisible} />
        ) : (
          <>
            <Suspense>
              <LazyInfoCardContainer />
            </Suspense>
            <ScaleBarContainer />
            <TimeBarContainer hidden={paletteOpen || splashVisible} />
            <div className={appStyles.leftStack}>
              <NavigationPanelContainer />
              <Suspense>
                <LazySettingsPanelContainer />
              </Suspense>
            </div>
          </>
        )}
        <TopBarContainer />
        <Suspense>
          <LazyCommandPaletteContainer />
        </Suspense>
        {/* `handleRef.current` set means the engine finished constructing: no subscribe race. */}
        {debugPanelOpen && handleRef.current && (
          <Suspense>
            <LazyDebugPanelContainer engineHandleRef={handleRef} />
          </Suspense>
        )}
      </div>
      {tourOverlay}
      {exhibitOverlay}
      {/* Progress chrome: interactive session only, never the cinema frames. */}
      {tourActive && <TourBeatRailContainer />}
      <SplashContainer />
      <ArrivalVeilContainer />
    </>
  );
}
