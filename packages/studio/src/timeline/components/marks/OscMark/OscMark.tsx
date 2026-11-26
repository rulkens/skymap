import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { oscWaveAt } from '../../../utils/oscWaveAt';
import { MAX_POINTS, POINTS_PER_CYCLE } from './OscMark.constants';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './OscMark.module.css';

/** The oscillation's sine at its real period and phase, drawn over the visible part of its extent. */
function OscMark({ row, window, selected }: MarkProps) {
  const { wave, startSec, tailEndSec } = row;
  if (wave === undefined || startSec === null || tailEndSec === null || !(wave.periodSec > 0)) {
    return null;
  }
  const from = Math.max(startSec, window.startSec);
  const to = Math.min(tailEndSec, window.endSec);
  if (to <= from) return null;
  const length = to - from;
  const count = Math.min(MAX_POINTS, Math.ceil((length / wave.periodSec) * POINTS_PER_CYCLE));
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const t = (i / count) * length;
    return `${t},${1 - 0.8 * oscWaveAt(wave, from + t)}`;
  }).join(' ');
  return (
    <svg
      className={cx(s.root, selected && s.selected, row.errors.length > 0 && s.invalid)}
      style={spanStyle(from, to, window)}
      viewBox={`0 0 ${length} 2`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default OscMark;
