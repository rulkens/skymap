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
import type { ViewId } from '../../@types/views/ViewId';
import type { ViewToggle } from '../../@types/views/ViewToggle';

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
      toggleOn={toggleOn}
      onToggle={onToggle}
      onExit={onExit}
    />
  );
}

export default ViewOverlayContainer;
