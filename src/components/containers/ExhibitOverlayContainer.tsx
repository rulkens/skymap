/**
 * ExhibitOverlayContainer — store boundary for the exhibit overlay.
 *
 * App mounts this only while the active takeover source is an exhibit (mirrors
 * TourOverlayContainer: the container does not re-gate on `kind`), passing
 * the resolved id rather than the whole `TakeoverSource` — a narrower read
 * than the container re-deriving it from the takeover slice itself.
 */

import { useCallback, useState } from 'react';
import ExhibitOverlay from '../ExhibitOverlay/ExhibitOverlay';
import { useAppDispatch } from '../../store/hooks';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { FLY_TO_POSE_SEC } from '../../data/animation/clips/makers/flyToPoseClip';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';
import type { ExhibitToggle } from '../../@types/exhibits/ExhibitToggle';

/**
 * How far before the fly-in lands the copy starts arriving. The overlay
 * mounts when the takeover starts, but the words are about where the camera
 * ENDS up — reading them over a scene still rushing past is the wrong order.
 * Short enough that the last of the move is read as the copy settling in.
 */
const COPY_LEAD_SEC = 1.8;

export type ExhibitOverlayContainerProps = {
  readonly id: ExhibitId;
};

function ExhibitOverlayContainer({ id }: ExhibitOverlayContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const exhibit = exhibitRegistry[id];

  // The switch is honest as local state: during a takeover nothing else writes
  // what its arms touch, and `runTakeover`'s snapshot rewinds them on exit.
  // Holding the switched-on exhibit's id rather than a boolean is what resets it
  // when the takeover passes to another exhibit.
  const [toggledId, setToggledId] = useState<ExhibitId | null>(null);
  const toggleOn = toggledId === id;

  const onToggle = useCallback(
    (toggle: ExhibitToggle, on: boolean) => {
      setToggledId(on ? id : null);
      for (const action of on ? toggle.on : toggle.off) dispatch(action);
    },
    [dispatch, id],
  );

  const onExit = useCallback(() => dispatch(exitTakeover()), [dispatch]);

  return (
    <ExhibitOverlay
      label={exhibit.label}
      lede={exhibit.lede}
      body={exhibit.body}
      enterDelaySec={FLY_TO_POSE_SEC - COPY_LEAD_SEC}
      toggleOn={toggleOn}
      onToggle={onToggle}
      onExit={onExit}
    />
  );
}

export default ExhibitOverlayContainer;
