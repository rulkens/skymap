import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './CompositeMark.module.css';

/** A flat lane over a path's whole window, named; its knots are the waypoint rows beneath it. */
function CompositeMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  return (
    <span
      className={cx(s.root, selected && s.selected, row.errors.length > 0 && s.invalid)}
      style={spanStyle(row.startSec, row.endSec, window)}
    >
      <span className={s.text}>{row.label.name}</span>
    </span>
  );
}

export default CompositeMark;
