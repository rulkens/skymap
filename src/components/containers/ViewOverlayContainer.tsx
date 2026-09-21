// src/components/containers/ViewOverlayContainer.tsx
/**
 * ViewOverlayContainer — store boundary for the view overlay.
 *
 * App mounts this only while the active takeover source is a view (mirrors
 * TourOverlayContainer: the container does not re-gate on `kind`), passing
 * the resolved id rather than the whole `TakeoverSource` — a narrower read
 * than the container re-deriving it from the takeover slice itself.
 */

import { useCallback } from 'react';
import ViewOverlay from '../ViewOverlay/ViewOverlay';
import { useAppDispatch } from '../../store/hooks';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { viewRegistry } from '../../data/views/viewRegistry';
import type { ViewId } from '../../@types/views/ViewId';

export type ViewOverlayContainerProps = {
  readonly id: ViewId;
};

function ViewOverlayContainer({ id }: ViewOverlayContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const onExit = useCallback(() => dispatch(exitTakeover()), [dispatch]);
  const view = viewRegistry[id];

  return <ViewOverlay label={view.label} body={view.body} onExit={onExit} />;
}

export default ViewOverlayContainer;
