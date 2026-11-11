import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import MinusIcon from '../../../../../../src/components/icons/MinusIcon/MinusIcon';
import PlusIcon from '../../../../../../src/components/icons/PlusIcon/PlusIcon';
import { selectPlayheadSec, selectViewport } from '../../../session/state/selectors';
import { viewportSet } from '../../../session/state/studioSlice';
import { selectTimeline } from '../../state/selectTimeline';
import { viewWindow } from '../../utils/window/viewWindow';
import { zoomedViewport } from '../../utils/window/zoomedViewport';
import { ZOOM_FACTOR } from '../../data/zoom';
import { useAppDispatch, useAppSelector, useAppStore } from '../../../../../../src/store/hooks';
import s from './ZoomControls.module.css';

/** Zoom out, Fit (the level reads here), zoom in: each zooms about the playhead and keeps it in view. */
function ZoomControls() {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector(selectTimeline);
  const viewport = useAppSelector(selectViewport);
  const store = useAppStore();
  const resolved = timeline !== null && timeline.durationSec !== null;
  const fit = timeline === null ? null : viewWindow(null, timeline);
  const current = timeline === null ? null : viewWindow(viewport, timeline);

  const zoom = (factor: number) => {
    if (timeline !== null)
      dispatch(
        viewportSet(
          zoomedViewport(viewport, timeline, factor, selectPlayheadSec(store.getState())),
        ),
      );
  };
  const level =
    viewport === null || fit === null || current === null
      ? 'Fit'
      : `${+((fit.endSec - fit.startSec) / (current.endSec - current.startSec)).toFixed(1)}×`;

  return (
    <div className={s.root} role="group" aria-label="Zoom">
      <StudioTip name="Zoom out">
        <Button
          variant="quiet"
          size="compact"
          aria-label="Zoom out"
          disabled={!resolved || viewport === null}
          onClick={() => zoom(ZOOM_FACTOR)}
        >
          <MinusIcon size={14} />
        </Button>
      </StudioTip>
      <StudioTip name="Fit clip">
        <Button
          variant="quiet"
          size="compact"
          className={s.level}
          aria-pressed={viewport === null}
          disabled={!resolved}
          onClick={() => dispatch(viewportSet(null))}
        >
          {level}
        </Button>
      </StudioTip>
      <StudioTip name="Zoom in">
        <Button
          variant="quiet"
          size="compact"
          aria-label="Zoom in"
          disabled={!resolved}
          onClick={() => zoom(1 / ZOOM_FACTOR)}
        >
          <PlusIcon size={14} />
        </Button>
      </StudioTip>
    </div>
  );
}

export default ZoomControls;
