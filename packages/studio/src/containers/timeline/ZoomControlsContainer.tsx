import { useAppDispatch, useAppSelector } from '../../../../../src/store/hooks';
import ZoomControls from '../../timeline/components/ZoomControls/ZoomControls';
import { selectPlayheadSec, selectViewport } from '../../session/state/selectors';
import { viewportSet } from '../../session/state/studioSlice';
import { selectTimeline } from '../../timeline/state/selectTimeline';

function ZoomControlsContainer() {
  const dispatch = useAppDispatch();
  return (
    <ZoomControls
      timeline={useAppSelector(selectTimeline)}
      viewport={useAppSelector(selectViewport)}
      playheadSec={useAppSelector(selectPlayheadSec)}
      onViewportChange={(viewport) => dispatch(viewportSet(viewport))}
    />
  );
}

export default ZoomControlsContainer;
