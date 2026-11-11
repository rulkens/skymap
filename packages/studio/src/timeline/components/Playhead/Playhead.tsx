import { timeToPercent } from '../../utils/window/timeToPercent';
import { selectPlayheadSec } from '../../../session/state/selectors';
import { useAppSelector } from '../../../../../../src/store/hooks';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import s from './Playhead.module.css';

type Props = { readonly window: TimeWindow };

/** The playhead's line, drawn over the lanes inside an overlay that spans exactly the track area. */
function Playhead({ window }: Props) {
  const playheadSec = useAppSelector(selectPlayheadSec);
  return <span className={s.root} style={{ left: `${timeToPercent(playheadSec, window)}%` }} />;
}

export default Playhead;
