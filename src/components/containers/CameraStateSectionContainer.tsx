// src/components/containers/CameraStateSectionContainer.tsx
/**
 * CameraStateSectionContainer — engine-handle boundary for the "Camera"
 * debug readout, the same shape as `EarthTileAtlasSectionContainer`:
 * `cameraDebug` is engine-only data (the store read for `camera.base.frame`
 * happens inside the getter itself), so there's nothing to read off Redux
 * here.
 */

import { memo, type ReactElement } from 'react';
import type { RefObject } from 'react';
import CameraStateSection from '../DebugPanel/CameraStateSection';
import type { EngineHandle } from '../../@types/engine/EngineHandle';

export type CameraStateSectionContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function CameraStateSectionContainer({
  engineHandleRef,
}: CameraStateSectionContainerProps): ReactElement | null {
  const handle = engineHandleRef.current;
  if (!handle) return null;
  return <CameraStateSection cameraDebug={handle.debug.cameraDebug} />;
}

export default memo(CameraStateSectionContainer);
