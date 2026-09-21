// src/components/containers/ViewOverlayContainer.tsx
/**
 * ViewOverlayContainer — store boundary for the view overlay.
 *
 * App mounts this only while the active takeover source is a view (mirrors
 * TourOverlayContainer: the container does not re-gate on `kind`), passing
 * the resolved id rather than the whole `TakeoverSource` — a narrower read
 * than the container re-deriving it from the takeover slice itself.
 */

import { useCallback, useState } from 'react';
import ViewOverlay from '../ViewOverlay/ViewOverlay';
import { useAppDispatch } from '../../store/hooks';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { viewRegistry } from '../../data/views/viewRegistry';
import { FLY_TO_POSE_SEC } from '../../state/scene/flyToPoseClip';
import type { ViewId } from '../../@types/views/ViewId';
import type { ViewToggle } from '../../@types/views/ViewToggle';

/**
 * How far before the fly-in lands the copy starts arriving. The overlay
 * mounts when the takeover starts, but the words are about where the camera
 * ENDS up — reading them over a scene still rushing past is the wrong order.
 * Short enough that the last of the move is read as the copy settling in.
 */
const COPY_LEAD_SEC = 1.8;

export type ViewOverlayContainerProps = {
  readonly id: ViewId;
};

function ViewOverlayContainer({ id }: ViewOverlayContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const view = viewRegistry[id];

  // The switch is honest as local state: during a takeover nothing else writes
  // what its arms touch, and `runTakeover`'s snapshot rewinds them on exit.
  // Holding the switched-on view's id rather than a boolean is what resets it
  // when the takeover passes to another view.
  const [toggledId, setToggledId] = useState<ViewId | null>(null);
  const toggleOn = toggledId === id;

  const onToggle = useCallback(
    (toggle: ViewToggle, on: boolean) => {
      setToggledId(on ? id : null);
      for (const action of on ? toggle.on : toggle.off) dispatch(action);
    },
    [dispatch, id],
  );

  const onExit = useCallback(() => dispatch(exitTakeover()), [dispatch]);

  return (
    <ViewOverlay
      label={view.label}
      lede={view.lede}
      body={view.body}
      enterDelaySec={FLY_TO_POSE_SEC - COPY_LEAD_SEC}
      toggleOn={toggleOn}
      onToggle={onToggle}
      onExit={onExit}
    />
  );
}

export default ViewOverlayContainer;
