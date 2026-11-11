import { timeToPercent } from '../../utils/window/timeToPercent';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import s from './Playhead.module.css';

type Props = { readonly playheadSec: number; readonly window: TimeWindow };

/** The playhead's line, drawn over the lanes inside an overlay that spans exactly the track area. */
function Playhead({ playheadSec, window }: Props) {
  return <span className={s.root} style={{ left: `${timeToPercent(playheadSec, window)}%` }} />;
}

export default Playhead;
