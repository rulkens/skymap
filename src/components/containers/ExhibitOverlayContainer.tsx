/**
 * ExhibitOverlayContainer — store boundary for the exhibit overlay.
 *
 * App mounts this only while the active takeover source is an exhibit (mirrors
 * TourOverlayContainer: the container does not re-gate on `kind`), passing
 * the resolved id rather than the whole `TakeoverSource` — a narrower read
 * than the container re-deriving it from the takeover slice itself.
 */

import { useCallback } from 'react';
import ExhibitOverlay from '../ExhibitOverlay/ExhibitOverlay';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { exitTakeover } from '../../state/takeover/takeoverActions';
import { selectExhibitCopyDelaySec } from '../../state/takeover/selectors';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';

export type ExhibitOverlayContainerProps = {
  readonly id: ExhibitId;
};

function ExhibitOverlayContainer({ id }: ExhibitOverlayContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const exhibit = exhibitRegistry[id];
  const enterDelaySec = useAppSelector(selectExhibitCopyDelaySec);

  const onExit = useCallback(() => dispatch(exitTakeover()), [dispatch]);

  return (
    // Keyed on the id: a takeover passing to another exhibit remounts its sections' own state.
    <ExhibitOverlay
      key={id}
      label={exhibit.label}
      lede={exhibit.lede}
      body={exhibit.body}
      enterDelaySec={enterDelaySec}
      onExit={onExit}
    />
  );
}

export default ExhibitOverlayContainer;
