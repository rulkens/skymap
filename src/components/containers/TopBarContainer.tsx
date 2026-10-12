/**
 * TopBarContainer — store boundary for the top-centre pill row. Owns the shared
 * `paletteOpen || splashVisible` gate (the row fades together), the three inline
 * pill dispatches, and the sibling pill containers. On a phone, search, home and
 * about live in the dock; a full-screen pill joins the right-aligned cluster.
 */

import { memo, useCallback } from 'react';
import SearchTrigger from '../SearchTrigger/SearchTrigger';
import HomeButton from '../HomeButton/HomeButton';
import AboutPill from '../Splash/AboutPill';
import AutoRotateToggleContainer from './AutoRotateToggleContainer';
import FullscreenToggleContainer from './FullscreenToggleContainer';
import TourDebugPillContainer from './TourDebugPillContainer';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectPaletteOpen, selectSplashVisible } from '../../state/ui/selectors';
import { setPaletteOpen, reopenSplash } from '../../state/ui/uiSlice';
import { goHome } from '../../state/selection/goHome';
import { useIsMobile } from '../../hooks/useIsMobile';
import { hasUrlGate } from '../../utils/url/hasUrlGate';
import styles from './TopBarContainer.module.css';

// Temporary `?tour` debug gate for the grand-tour pill. Read once at module
// scope — the search string can't change without a full page reload.
const TOUR_DEBUG_GATE = hasUrlGate('tour');

function TopBarContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  // Shared HUD-pill gate: the whole top-center row fades together when the
  // palette opens or the splash is up. Both reads are their own statement —
  // folding them into one `||` expression short-circuits the second
  // `useAppSelector` as soon as the first is true, which changes the hook count
  // mid-session and crashes React on the next hook.
  const paletteOpen = useAppSelector(selectPaletteOpen);
  const splashVisible = useAppSelector(selectSplashVisible);
  const hidden = paletteOpen || splashVisible;
  const isMobile = useIsMobile();

  const openPalette = useCallback(() => dispatch(setPaletteOpen(true)), [dispatch]);
  // "Home" flies to Earth — the viewer's literal starting point, not just our
  // galaxy. The Home pill dispatches the one `goHome` intent, shared with the
  // `h`/`e` keys.
  const goHomeCb = useCallback(() => dispatch(goHome()), [dispatch]);
  const reopenSplashScreen = useCallback(() => dispatch(reopenSplash()), [dispatch]);

  return (
    <div className={styles.root}>
      {!isMobile && <SearchTrigger onClick={openPalette} hidden={hidden} />}
      {!isMobile && <HomeButton onClick={goHomeCb} hidden={hidden} />}
      <AutoRotateToggleContainer hidden={hidden} />
      <FullscreenToggleContainer hidden={hidden} />
      {!isMobile && <AboutPill onClick={reopenSplashScreen} hidden={hidden} />}
      {TOUR_DEBUG_GATE && <TourDebugPillContainer hidden={hidden} />}
    </div>
  );
}

export default memo(TopBarContainer);
