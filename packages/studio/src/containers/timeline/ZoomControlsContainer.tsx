import { useAppDispatch, useAppSelector, useAppStore } from '../../../../../src/store/hooks';
import ZoomControls from '../../timeline/components/ZoomControls/ZoomControls';
import { selectPlayheadSec, selectViewport } from '../../session/state/selectors';
import { viewportSet } from '../../session/state/studioSlice';
import { selectTimeline } from '../../timeline/state/selectTimeline';
import { zoomedViewport } from '../../timeline/utils/window/zoomedViewport';

function ZoomControlsContainer() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const timeline = useAppSelector(selectTimeline);
  const viewport = useAppSelector(selectViewport);
  // The playhead is read at the press, so the bar does not re-render with every played frame.
  const zoom = (factor: number) => {
    if (timeline !== null) {
      const head = selectPlayheadSec(store.getState());
      dispatch(viewportSet(zoomedViewport(viewport, timeline, factor, head)));
    }
  };
  return (
    <ZoomControls
      timeline={timeline}
      viewport={viewport}
      onZoom={zoom}
      onFit={() => dispatch(viewportSet(null))}
    />
  );
}

export default ZoomControlsContainer;
