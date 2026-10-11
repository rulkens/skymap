/**
 * PhoneHudContainer — the phone's bottom HUD: dock, time row and the one sheet.
 *
 * Owns which dock item is open. Layers wins over the selection card while
 * open; the time row is independent and can stay open under any sheet. Home and
 * Search are actions, dispatched exactly as the desktop pill and key do. A new selection closes the
 * open panel so the card it asked for shows. Selection is read by identity key,
 * not object, so unrelated selection-slice writes do not close a panel.
 */

import { memo, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import BottomStack from '../BottomStack/BottomStack';
import MobileSheet from '../MobileSheet/MobileSheet';
import DockContainer from './DockContainer';
import TimeBarContainer from './TimeBarContainer';
import ScaleBracketContainer from './ScaleBracketContainer';
import LazyInfoCardContainer from './LazyInfoCardContainer';
import LazySettingsPanelContainer from './LazySettingsPanelContainer';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSelectedFocusable } from '../../state/selection/selectors';
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

  const [panel, setPanel] = useState<'layers' | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => setPanel(null), [selectionKey]);

  const closePanel = useCallback(() => setPanel(null), []);
  const onLayers = useCallback(() => setPanel((cur) => (cur === 'layers' ? null : 'layers')), []);
  // Closing the panel too: when Earth is already selected, home changes no
  // selection, so the key-change close above would leave Layers covering it.
  const onHome = useCallback(() => {
    setPanel(null);
    dispatch(goHome());
  }, [dispatch]);
  const onSearch = useCallback(() => dispatch(setPaletteOpen(true)), [dispatch]);
  const onTime = useCallback(() => setTimeOpen((cur) => !cur), []);

  let sheet: ReactNode = null;
  if (panel === 'layers') {
    sheet = (
      <MobileSheet resetKey="panel:layers" panel={{ title: 'Layers', onClose: closePanel }}>
        <Suspense>
          <LazySettingsPanelContainer bare />
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
          layersOpen={panel === 'layers'}
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
