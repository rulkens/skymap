import { timeToPercent } from '../../utils/window/timeToPercent';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import s from './Playhead.module.css';

type PlayheadProps = { readonly playheadSec: number; readonly window: TimeWindow };

/** The playhead's line, drawn over the lanes inside an overlay that spans exactly the track area. */
function Playhead({ playheadSec, window }: PlayheadProps) {
  return <span className={s.root} style={{ left: `${timeToPercent(playheadSec, window)}%` }} />;
}

export default Playhead;
