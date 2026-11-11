import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { timeToPercent } from '../../../utils/window/timeToPercent';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './KnotMark.module.css';

/** One waypoint of a path: its leg as a thin line and the arrival as a dot. */
function KnotMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  return (
    <>
      <span className={s.leg} style={spanStyle(row.startSec, row.endSec, window)} />
      <span
        className={cx(s.knot, selected && s.selected)}
        style={{ left: `${timeToPercent(row.endSec, window)}%` }}
      />
    </>
  );
}

export default KnotMark;
