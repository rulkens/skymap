import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { timeToPercent } from '../../../utils/window/timeToPercent';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './GroupMark.module.css';

/** A bracket over the group's window (arrowhead for Sequence, double rule for All); a zero-length one is a tick. Unlabelled: the outline names it. */
function GroupMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  const invalid = row.errors.length > 0;
  if (row.endSec === row.startSec) {
    const at = { left: `${timeToPercent(row.startSec, window)}%` };
    return <span className={cx(s.zero, invalid && s.invalid)} style={at} />;
  }
  return (
    <span
      className={cx(
        s.bracket,
        row.kind === 'seq' && s.seq,
        row.kind === 'all' && s.all,
        row.collapsed && s.collapsed,
        selected && s.selected,
        invalid && s.invalid,
      )}
      style={spanStyle(row.startSec, row.endSec, window)}
    />
  );
}

export default GroupMark;
