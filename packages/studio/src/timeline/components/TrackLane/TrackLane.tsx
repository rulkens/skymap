import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import { ROW_KINDS } from '../../../kinds/data/rowKinds';
import { familyStyle } from '../../utils/familyStyle';
import { spanStyle } from '../../utils/spanStyle';
import { timeToPercent } from '../../utils/timeToPercent';
import { TAG_ROOM_PERCENT, TRACK_MARKS } from './TrackLane.constants';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { TimelineRow } from '../../../@types/rows/TimelineRow';
import s from './TrackLane.module.css';

type Props = {
  readonly row: TimelineRow;
  /** Outermost first. */
  readonly ancestors: readonly TimelineRow[];
  readonly window: TimeWindow;
  readonly selected: boolean;
};

function TrackLane({ row, ancestors, window, selected }: Props) {
  const Mark = TRACK_MARKS[ROW_KINDS[row.kind].mark];
  const tagAt =
    row.background && row.startSec !== null ? timeToPercent(row.startSec, window) : null;
  return (
    <div className={s.root} style={familyStyle(row.family)} aria-hidden>
      {ancestors.map((ancestor) =>
        ancestor.startSec === null || ancestor.endSec === null ? null : (
          <span
            key={ancestor.id}
            className={cx(
              s.band,
              ancestor.kind === 'all' && s.all,
              ancestor.kind === 'fork' && s.fork,
            )}
            style={spanStyle(ancestor.startSec, ancestor.endSec, window)}
          />
        ),
      )}
      <Mark row={row} window={window} selected={selected} />
      {tagAt !== null && (
        <span
          className={s.tag}
          style={
            tagAt > TAG_ROOM_PERCENT
              ? { right: `calc(${100 - tagAt}% + var(--space-3))` }
              : { left: `calc(${tagAt}% + var(--space-3))` }
          }
        >
          <Glyph id="fork" size={12} />
          Background
        </span>
      )}
    </div>
  );
}

export default TrackLane;
