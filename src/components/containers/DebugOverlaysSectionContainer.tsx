// src/components/containers/DebugOverlaysSectionContainer.tsx
/**
 * DebugOverlaysSectionContainer — store boundary for the renderer's raw
 * debug overlay toggles (pick-buffer view, disk-radius ring, orbit-trail
 * impostor). All are simple RTK settings booleans with no derived read, so
 * the single handler closes over nothing but `dispatch`.
 */

import { memo, useCallback } from 'react';
import DebugOverlaysSection from '../DebugPanel/DebugOverlaysSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectDebugOverlays } from '../../state/settings/selectors';
import { setDebugOverlay } from '../../state/settings/settingsSlice';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';

function DebugOverlaysSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const overlays = useAppSelector(selectDebugOverlays);

  const onToggle = useCallback(
    (key: DebugOverlayKey, enabled: boolean) => dispatch(setDebugOverlay({ key, enabled })),
    [dispatch],
  );

  return <DebugOverlaysSection overlays={overlays} onToggle={onToggle} />;
}

export default memo(DebugOverlaysSectionContainer);
