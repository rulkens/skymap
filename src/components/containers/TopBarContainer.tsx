// src/components/containers/TopBarContainer.tsx
/**
 * TopBarContainer — store boundary for the top-center pill row.
 *
 * Owns the shared `paletteOpen || splashVisible` gate (the whole row fades
 * together) and the three inline pill dispatches (open palette, go home,
 * reopen splash), and renders the row's fixed children including the two
 * sibling pill containers (`AutoRotateToggleContainer`, `TourDebugPillContainer`),
 * so App no longer needs any of this reach.
 */

import { memo, useCallback } from 'react';
import SearchTrigger from '../SearchTrigger/SearchTrigger';
import HomeButton from '../HomeButton/HomeButton';
import AboutPill from '../Splash/AboutPill';
import AutoRotateToggleContainer from './AutoRotateToggleContainer';
import TourDebugPillContainer from './TourDebugPillContainer';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectPaletteOpen, selectSplashVisible } from '../../state/ui/selectors';
import { setPaletteOpen, reopenSplash } from '../../state/ui/uiSlice';
import { goHome } from '../../state/selection/goHome';
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

  const openPalette = useCallback(() => dispatch(setPaletteOpen(true)), [dispatch]);
  // "Home" flies to Earth — the viewer's literal starting point, not just our
  // galaxy. The Home pill dispatches the one `goHome` intent, shared with the
  // `h`/`e` keys.
  const goHomeCb = useCallback(() => dispatch(goHome()), [dispatch]);
  const reopenSplashScreen = useCallback(() => dispatch(reopenSplash()), [dispatch]);

  return (
    <div className={styles.root}>
      <SearchTrigger onClick={openPalette} hidden={hidden} />
      <HomeButton onClick={goHomeCb} hidden={hidden} />
      <AutoRotateToggleContainer hidden={hidden} />
      <AboutPill onClick={reopenSplashScreen} hidden={hidden} />
      {TOUR_DEBUG_GATE && <TourDebugPillContainer hidden={hidden} />}
    </div>
  );
}

export default memo(TopBarContainer);
