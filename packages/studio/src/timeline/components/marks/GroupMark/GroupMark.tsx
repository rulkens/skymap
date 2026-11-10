import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { timeToPercent } from '../../../utils/window/timeToPercent';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './GroupMark.module.css';

/** A bracket over the group's window (arrowhead for In order, double rule for Together); a zero-length one is a tick. */
function GroupMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  const { name } = row.label;
  const invalid = row.errors.length > 0;
  if (row.endSec === row.startSec) {
    const at = { left: `${timeToPercent(row.startSec, window)}%` };
    return (
      <>
        <span className={cx(s.zero, invalid && s.invalid)} style={at} />
        <span className={s.zeroLabel} style={at}>{`${name} · 0 s`}</span>
      </>
    );
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
    >
      <span className={s.label}>{name}</span>
    </span>
  );
}

export default GroupMark;
