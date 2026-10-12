/**
 * PhoneHudContainer — the phone's bottom HUD: dock, time row and the one sheet.
 *
 * Owns which dock item is open. Layers wins over the selection card while
 * open; the time row is independent and can stay open under any sheet. Home and
 * Search are actions, dispatched exactly as the desktop pill and key do. A NEW
 * selection closes Layers so its card shows; clearing the selection does not.
 * Selection is read by identity key, not object, so unrelated slice writes
 * close nothing. Closing Layers or the palette returns focus to its dock item.
 */

import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import BottomStack from '../BottomStack/BottomStack';
import MobileSheet from '../MobileSheet/MobileSheet';
import DockContainer from './DockContainer';
import TimeBarContainer from './TimeBarContainer';
import ScaleBracketContainer from './ScaleBracketContainer';
import LazyInfoCardContainer from './LazyInfoCardContainer';
import LazyPhoneSettingsContainer from './LazyPhoneSettingsContainer';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSelectedFocusable } from '../../state/selection/selectors';
import { selectPaletteOpen } from '../../state/ui/selectors';
import { setPaletteOpen } from '../../state/ui/uiSlice';
import { goHome } from '../../state/selection/goHome';
import { TARGET_IDENTITY_KEY } from '../../services/engine/helpers/targetIdentityKey';

export type PhoneHudContainerProps = {
  // Same App-layout gate the desktop TimeBar takes (palette open).
  readonly hidden: boolean;
};

function PhoneHudContainer({ hidden }: PhoneHudContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const selected = useAppSelector(selectSelectedFocusable);
  const selectionKey = selected ? TARGET_IDENTITY_KEY[selected.type](selected) : null;

  const paletteOpen = useAppSelector(selectPaletteOpen);

  const [layersOpen, setLayersOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const searchRef = useRef<HTMLButtonElement>(null);
  const layersRef = useRef<HTMLButtonElement>(null);
  const searchedFromDock = useRef(false);

  useEffect(() => {
    if (selectionKey !== null) setLayersOpen(false);
  }, [selectionKey]);

  // The palette unmounts with focus inside it, which leaves focus on BODY.
  useEffect(() => {
    if (!paletteOpen && searchedFromDock.current) {
      searchedFromDock.current = false;
      searchRef.current?.focus();
    }
  }, [paletteOpen]);

  const closeLayers = useCallback(() => {
    setLayersOpen(false);
    layersRef.current?.focus();
  }, []);
  const onLayers = useCallback(() => setLayersOpen((cur) => !cur), []);
  // Closing Layers too: when Earth is already selected, home changes no
  // selection, so the selection-change close above would leave Layers covering it.
  const onHome = useCallback(() => {
    setLayersOpen(false);
    dispatch(goHome());
  }, [dispatch]);
  const onSearch = useCallback(() => {
    searchedFromDock.current = true;
    dispatch(setPaletteOpen(true));
  }, [dispatch]);
  const onTime = useCallback(() => setTimeOpen((cur) => !cur), []);

  let sheet: ReactNode = null;
  if (layersOpen) {
    sheet = (
      <MobileSheet resetKey="layers" panel={{ title: 'Layers', onClose: closeLayers }}>
        <Suspense>
          <LazyPhoneSettingsContainer />
        </Suspense>
      </MobileSheet>
    );
  } else if (selectionKey !== null) {
    sheet = (
      <MobileSheet resetKey={selectionKey}>
        <Suspense>
          <LazyInfoCardContainer />
        </Suspense>
      </MobileSheet>
    );
  }

  return (
    <BottomStack
      timeOpen={timeOpen}
      sheet={sheet}
      scale={<ScaleBracketContainer />}
      timeRow={<TimeBarContainer hidden={hidden} row />}
      dock={
        <DockContainer
          timeOpen={timeOpen}
          layersOpen={layersOpen}
          searchRef={searchRef}
          layersRef={layersRef}
          onHome={onHome}
          onSearch={onSearch}
          onTime={onTime}
          onLayers={onLayers}
        />
      }
    />
  );
}

export default memo(PhoneHudContainer);
