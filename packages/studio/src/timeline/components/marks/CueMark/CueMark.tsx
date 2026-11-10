import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { timeToPercent } from '../../../utils/timeToPercent';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './CueMark.module.css';

/** An instant: a diamond (hollow for show and hide, square for set, ring for focus), with its fade extent as a tail. */
function CueMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null) return null;
  const shape =
    row.kind === 'show' || row.kind === 'hide'
      ? s.hollow
      : row.kind === 'set'
        ? s.square
        : row.kind === 'focus'
          ? s.ring
          : s.diamond;
  const tailEnd = row.tailEndSec !== null && row.tailEndSec > row.startSec ? row.tailEndSec : null;
  return (
    <>
      {tailEnd !== null && (
        <span className={s.tail} style={spanStyle(row.startSec, tailEnd, window)} />
      )}
      <span
        className={cx(s.cue, shape, selected && s.selected, row.errors.length > 0 && s.invalid)}
        style={{ left: `${timeToPercent(row.startSec, window)}%` }}
      />
    </>
  );
}

export default CueMark;
