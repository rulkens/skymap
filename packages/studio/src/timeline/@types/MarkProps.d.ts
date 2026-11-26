/** What every track mark gets: its row, the visible time window, and whether the row stands for the selection. */
import type { ObjectIndex } from '../../@types/kinds/ObjectIndex';
import type { TimeWindow } from '../../@types/session/TimeWindow';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export type MarkProps = {
  readonly row: TimelineRow;
  readonly window: TimeWindow;
  readonly selected: boolean;
  /** A block the selection sits in; only group marks draw it. */
  readonly contains?: boolean;
  /** Names a bound subject; only bars read it. */
  readonly objects: ObjectIndex;
};
