/**
 * PhoneHudContainer — the phone's bottom HUD: dock, time row and the one sheet.
 *
 * Owns which dock item is open. Places and Layers share the sheet (one at a
 * time) and win over the selection card while open; the time row is
 * independent and can stay open under any sheet. A new selection closes the
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
import NavigationPanelContainer from './NavigationPanelContainer';
import LazyInfoCardContainer from './LazyInfoCardContainer';
import LazySettingsPanelContainer from './LazySettingsPanelContainer';
import { useAppSelector } from '../../store/hooks';
import { selectSelectedFocusable } from '../../state/selection/selectors';
import { TARGET_IDENTITY_KEY } from '../../services/engine/helpers/targetIdentityKey';

export type PhoneHudContainerProps = {
  // Same App-layout gate the desktop TimeBar takes (palette open).
  readonly hidden: boolean;
};

function PhoneHudContainer({ hidden }: PhoneHudContainerProps): ReactNode {
  const selected = useAppSelector(selectSelectedFocusable);
  const selectionKey = selected ? TARGET_IDENTITY_KEY[selected.type](selected) : null;

  const [panel, setPanel] = useState<'places' | 'layers' | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => setPanel(null), [selectionKey]);

  const closePanel = useCallback(() => setPanel(null), []);
  const closeTime = useCallback(() => setTimeOpen(false), []);
  const onPlaces = useCallback(() => setPanel((cur) => (cur === 'places' ? null : 'places')), []);
  const onLayers = useCallback(() => setPanel((cur) => (cur === 'layers' ? null : 'layers')), []);
  const onTime = useCallback(() => setTimeOpen((cur) => !cur), []);

  let sheet: ReactNode = null;
  if (panel === 'places') {
    sheet = (
      <MobileSheet resetKey="panel:places" panel={{ title: 'Places', onClose: closePanel }}>
        <NavigationPanelContainer bare />
      </MobileSheet>
    );
  } else if (panel === 'layers') {
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
      timeRow={<TimeBarContainer hidden={hidden} onCloseRow={closeTime} />}
      dock={
        <DockContainer
          placesOpen={panel === 'places'}
          timeOpen={timeOpen}
          layersOpen={panel === 'layers'}
          onPlaces={onPlaces}
          onTime={onTime}
          onLayers={onLayers}
        />
      }
    />
  );
}

export default memo(PhoneHudContainer);
