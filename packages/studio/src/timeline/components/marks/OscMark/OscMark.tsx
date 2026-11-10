import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { WAVE_SEC } from './OscMark.constants';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './OscMark.module.css';

/** A wave over the oscillation's visible extent; its cycles are decorative, the period is the inspector's. */
function OscMark({ row, window, selected }: MarkProps) {
  const end = row.tailEndSec;
  if (row.startSec === null || end === null || end <= row.startSec) return null;
  const length = end - row.startSec;
  const points = Array.from({ length: 121 }, (_, i) => {
    const t = (i / 120) * length;
    return `${t},${1 - 0.8 * Math.sin((2 * Math.PI * t) / WAVE_SEC)}`;
  }).join(' ');
  return (
    <svg
      className={cx(s.root, selected && s.selected, row.errors.length > 0 && s.invalid)}
      style={spanStyle(row.startSec, end, window)}
      viewBox={`0 0 ${length} 2`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default OscMark;
