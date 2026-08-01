// src/components/containers/DebugOverlaysSectionContainer.tsx
/**
 * DebugOverlaysSectionContainer — store boundary for the renderer's raw
 * debug overlay toggles (pick-buffer view, disk-radius ring, orbit-trail
 * impostor). All are simple RTK settings booleans with no derived read, so
 * each handler closes over nothing but `dispatch`.
 */

import { memo, useCallback } from 'react';
import DebugOverlaysSection from '../DebugPanel/DebugOverlaysSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectShowPickBuffer,
  selectShowDiskRadiusRing,
  selectShowOrbitTrailImpostor,
} from '../../state/settings/selectors';
import {
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setShowOrbitTrailImpostor,
} from '../../state/settings/settingsSlice';

function DebugOverlaysSectionContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const showPickBuffer = useAppSelector(selectShowPickBuffer);
  const showDiskRadiusRing = useAppSelector(selectShowDiskRadiusRing);
  const showOrbitTrailImpostor = useAppSelector(selectShowOrbitTrailImpostor);

  const onShowPickBufferChange = useCallback(
    (enabled: boolean) => dispatch(setShowPickBuffer(enabled)),
    [dispatch],
  );

  const onShowDiskRadiusRingChange = useCallback(
    (enabled: boolean) => dispatch(setShowDiskRadiusRing(enabled)),
    [dispatch],
  );

  const onShowOrbitTrailImpostorChange = useCallback(
    (enabled: boolean) => dispatch(setShowOrbitTrailImpostor(enabled)),
    [dispatch],
  );

  return (
    <DebugOverlaysSection
      showPickBuffer={showPickBuffer}
      onShowPickBufferChange={onShowPickBufferChange}
      showDiskRadiusRing={showDiskRadiusRing}
      onShowDiskRadiusRingChange={onShowDiskRadiusRingChange}
      showOrbitTrailImpostor={showOrbitTrailImpostor}
      onShowOrbitTrailImpostorChange={onShowOrbitTrailImpostorChange}
    />
  );
}

export default memo(DebugOverlaysSectionContainer);
