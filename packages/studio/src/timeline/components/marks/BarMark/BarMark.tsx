import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './BarMark.module.css';

/** A move over its window; overlapping steps draw as plain overlapping bars (the crossfade taper is slice S5). */
function BarMark({ row, window, selected }: MarkProps) {
  if (row.startSec === null || row.endSec === null) return null;
  const { op, value, subject } = row.label;
  const text = [op, subject, value].filter(Boolean).join(' ');
  // Zoomed past the bar's start, its label sticks to the window's left edge.
  const hidden = (window.startSec - row.startSec) / (row.endSec - row.startSec || 1);
  const stuck = Math.min(100, Math.max(0, hidden * 100));
  return (
    <span
      className={cx(s.root, selected && s.selected, row.errors.length > 0 && s.invalid)}
      style={{
        ...spanStyle(row.startSec, row.endSec, window),
        paddingLeft: `calc(${stuck}% + var(--space-3))`,
      }}
    >
      <span className={s.text}>{text}</span>
    </span>
  );
}

export default BarMark;
