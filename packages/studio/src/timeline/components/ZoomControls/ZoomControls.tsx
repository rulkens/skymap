import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import MinusIcon from '../../../../../../src/components/icons/MinusIcon/MinusIcon';
import PlusIcon from '../../../../../../src/components/icons/PlusIcon/PlusIcon';
import { selectViewport } from '../../../session/state/selectors';
import { viewportSet } from '../../../session/state/studioSlice';
import { selectTimeline } from '../../state/selectTimeline';
import { viewWindow } from '../../utils/viewWindow';
import { MIN_SPAN_SEC, ZOOM_FACTOR } from './ZoomControls.constants';
import { useAppDispatch, useAppSelector } from '../../../../../../src/store/hooks';
import s from './ZoomControls.module.css';

/** Zoom out, Fit (the level reads here), zoom in: each zooms about the middle of the visible window. */
function ZoomControls() {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector(selectTimeline);
  const viewport = useAppSelector(selectViewport);
  const resolved = timeline !== null && timeline.durationSec !== null;
  const fit = timeline === null ? null : viewWindow(null, timeline);
  const current = timeline === null ? null : viewWindow(viewport, timeline);

  const zoom = (factor: number) => {
    if (fit === null || current === null) return;
    const fitSpan = fit.endSec - fit.startSec;
    const span = Math.max(MIN_SPAN_SEC, (current.endSec - current.startSec) * factor);
    if (span >= fitSpan) return void dispatch(viewportSet(null));
    const centre = (current.startSec + current.endSec) / 2;
    const startSec = Math.min(Math.max(0, centre - span / 2), fit.endSec - span);
    dispatch(viewportSet({ startSec, endSec: startSec + span }));
  };
  const level =
    viewport === null || fit === null || current === null
      ? 'Fit'
      : `${+((fit.endSec - fit.startSec) / (current.endSec - current.startSec)).toFixed(1)}×`;

  return (
    <div className={s.root} role="group" aria-label="Zoom">
      <StudioTip name="Zoom out">
        <button
          type="button"
          className={s.button}
          aria-label="Zoom out"
          disabled={!resolved || viewport === null}
          onClick={() => zoom(ZOOM_FACTOR)}
        >
          <MinusIcon size={14} />
        </button>
      </StudioTip>
      <StudioTip name="Fit clip">
        <button
          type="button"
          className={s.level}
          aria-pressed={viewport === null}
          disabled={!resolved}
          onClick={() => dispatch(viewportSet(null))}
        >
          {level}
        </button>
      </StudioTip>
      <StudioTip name="Zoom in">
        <button
          type="button"
          className={s.button}
          aria-label="Zoom in"
          disabled={!resolved}
          onClick={() => zoom(1 / ZOOM_FACTOR)}
        >
          <PlusIcon size={14} />
        </button>
      </StudioTip>
    </div>
  );
}

export default ZoomControls;
