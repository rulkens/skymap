// src/components/containers/SplashContainer.tsx
/**
 * SplashContainer — store boundary for the splash overlay.
 *
 * Owns the splash's whole state surface (visibility gate, readiness, error
 * mapping, Continue-anyway timer via `useSplash`; load progress from the engine
 * slice) so that splash state changes re-render only this subtree, not the whole
 * App. The presentational `Splash` imports nothing from `store/` or `state/`.
 *
 * The Tour CTA dismisses the splash and launches the grand tour. Dismiss first
 * so the HUD-hide (derived from `tour.active`) starts from a clean base.
 *
 * Renders nothing when the splash is not visible — App mounts this
 * unconditionally and the container gates on its own `splashVisible`.
 */

import { useCallback } from 'react';
import type { ReactNode } from 'react';
import Splash from '../Splash/Splash';
import { useSplash } from '../../hooks/useSplash';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectLoadProgress } from '../../state/engine/selectors';
import { startTour } from '../../state/tour/tourActions';

function SplashContainer(): ReactNode {
  const splash = useSplash();
  const loadProgress = useAppSelector(selectLoadProgress);
  const dispatch = useAppDispatch();

  const onTour = useCallback(() => {
    splash.dismissTour();
    dispatch(startTour('grandTour'));
  }, [splash, dispatch]);

  if (!splash.splashVisible) return null;

  return (
    <Splash
      blocked={splash.blocked}
      canContinueAnyway={splash.canContinueAnyway}
      loadProgress={loadProgress}
      error={splash.error}
      onExplore={splash.dismissExplore}
      onTour={onTour}
      onContinueAnyway={splash.dismissExplore}
      onReload={() => window.location.reload()}
    />
  );
}

export default SplashContainer;
