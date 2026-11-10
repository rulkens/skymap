import Glyph from '../../../../primitives/components/Glyph/Glyph';
import { timeToPercent } from '../../../utils/timeToPercent';
import type { MarkProps } from '../../../@types/MarkProps';
import s from './StartMark.module.css';

function StartMark({ row, window }: MarkProps) {
  if (row.startSec === null) return null;
  return (
    <span className={s.root} style={{ left: `${timeToPercent(row.startSec, window)}%` }}>
      <Glyph id="start" size={12} />
    </span>
  );
}

export default StartMark;
