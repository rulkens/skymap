import cx from 'classnames';
import { spanStyle } from '../../../utils/spanStyle';
import { stuckLabelInset } from '../../../utils/stuckLabelInset';
import { useObjectName } from '../../../../session/hooks/useObjectName';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './BarMark.module.css';

/**
 * A move over its window, to its visible end: a fade runs its `over` though nothing waits for it.
 * Overlapping steps draw as plain overlapping bars (the crossfade taper is slice S5).
 */
function BarMark({ row, window, selected }: MarkProps) {
  const subject = useObjectName(row.label.subject);
  const { startSec, tailEndSec: endSec } = row;
  if (startSec === null || endSec === null) return null;
  const { op, value } = row.label;
  const text = [op, subject, value].filter(Boolean).join(' ');
  const stuck = stuckLabelInset(startSec, endSec, window);
  return (
    <span
      className={cx(s.root, selected && s.selected, row.errors.length > 0 && s.invalid)}
      style={{
        ...spanStyle(startSec, endSec, window),
        paddingLeft: `calc(${stuck}% + var(--space-3))`,
      }}
    >
      <span className={s.text}>{text}</span>
    </span>
  );
}

export default BarMark;
