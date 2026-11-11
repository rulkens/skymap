import cx from 'classnames';
import { ROW_KINDS } from '../../../kinds/data/rowKinds';
import { familyStyle } from '../../utils/familyStyle';
import { spanStyle } from '../../utils/spanStyle';
import { TRACK_MARKS } from './TrackLane.constants';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { TimelineRow } from '../../../@types/rows/TimelineRow';
import s from './TrackLane.module.css';

type Props = {
  readonly row: TimelineRow;
  /** Outermost first. */
  readonly ancestors: readonly TimelineRow[];
  readonly window: TimeWindow;
  readonly selectedId: string | null;
  /** A block the selection sits in. */
  readonly contains: boolean;
  /** Aria-hidden like the rest of the lane: keyboard selection is the outline's. */
  readonly onSelect: () => void;
};

function TrackLane({ row, ancestors, window, selectedId, contains, onSelect }: Props) {
  const Mark = TRACK_MARKS[ROW_KINDS[row.kind].mark];
  return (
    <div className={s.root} style={familyStyle(row.family)} aria-hidden onClick={onSelect}>
      {ancestors.map((ancestor) =>
        ancestor.startSec === null || ancestor.endSec === null ? null : (
          <span
            key={ancestor.id}
            className={cx(
              s.band,
              ancestor.kind === 'all' && s.all,
              ancestor.kind === 'fork' && s.fork,
              ancestor.id === selectedId && s.bandSelected,
            )}
            style={spanStyle(ancestor.startSec, ancestor.endSec, window)}
          />
        ),
      )}
      <Mark row={row} window={window} selected={row.id === selectedId} contains={contains} />
    </div>
  );
}

export default TrackLane;
