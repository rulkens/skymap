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
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { selectExhibitCopyDelaySec } from '../../state/takeover/selectors';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';
import type { ExhibitToggle } from '../../@types/exhibits/ExhibitToggle';

export type ExhibitOverlayContainerProps = {
  readonly id: ExhibitId;
};

function ExhibitOverlayContainer({ id }: ExhibitOverlayContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const exhibit = exhibitRegistry[id];
  const enterDelaySec = useAppSelector(selectExhibitCopyDelaySec);

  // The switch is honest as local state: during a takeover nothing else writes
  // what its arms touch, and `runTakeoverSaga`'s snapshot rewinds them on exit.
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
      enterDelaySec={enterDelaySec}
      toggleOn={toggleOn}
      onToggle={onToggle}
      onExit={onExit}
    />
  );
}

export default ExhibitOverlayContainer;
