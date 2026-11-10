import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './GapMark.module.css';

/** Wait and hold: time passing with nothing moving. A hold is shaded, a wait is an empty outline. */
function GapMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  return (
    <span
      className={cx(
        s.root,
        row.kind === 'hold' && s.hold,
        selected && s.selected,
        row.errors.length > 0 && s.invalid,
      )}
      style={spanStyle(row.startSec, row.endSec, window)}
    />
  );
}

export default GapMark;
