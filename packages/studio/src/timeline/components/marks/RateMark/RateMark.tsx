import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './RateMark.module.css';

/** A rate ramp over its window, dotted on through the time it then holds. The slope is a shape, not the values. */
function RateMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  const holdEnd = row.tailEndSec !== null && row.tailEndSec > row.endSec ? row.tailEndSec : null;
  return (
    <>
      <span
        className={cx(s.ramp, selected && s.selected, row.errors.length > 0 && s.invalid)}
        style={spanStyle(row.startSec, row.endSec, window)}
      />
      {holdEnd !== null && (
        <span className={s.hold} style={spanStyle(row.endSec, holdEnd, window)} />
      )}
    </>
  );
}

export default RateMark;
