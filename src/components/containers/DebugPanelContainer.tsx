/**
 * DebugPanelContainer — engine-handle boundary for the debug panel.
 *
 * Unpacks the handle's `debug` reach into `DebugPanel`'s props. Both mount
 * gates stay in App: `debugPanelOpen`, because mounting this container to read
 * it would fetch the lazy panel chunk on every visit, and the handle being
 * set, because a ref change re-renders nothing and App re-renders anyway.
 */

import { memo } from 'react';
import type { RefObject } from 'react';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import DebugPanel from '../DebugPanel/DebugPanel';

export type DebugPanelContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function DebugPanelContainer({
  engineHandleRef,
}: DebugPanelContainerProps): React.ReactElement | null {
  const debug = engineHandleRef.current?.debug;
  if (!debug) return null;
  return (
    <DebugPanel
      slots={debug.assetSlots}
      timingService={debug.timingService}
      frameStats={debug.frameStats}
      passNames={debug.passOverrides.allNames}
      assetPriorities={debug.assetPriorities}
      engineHandleRef={engineHandleRef}
    />
  );
}

export default memo(DebugPanelContainer);
