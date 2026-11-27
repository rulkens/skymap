import { useMemo, type RefObject } from 'react';
import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import OutlineRow from '../OutlineRow/OutlineRow';
import TrackLane from '../TrackLane/TrackLane';
import { CHANNEL_FAMILY_LEGEND } from '../../../data/channelFamilies';
import PlayheadContainer from '../../../containers/timeline/PlayheadContainer';
import RulerContainer from '../../../containers/timeline/RulerContainer';
import { timeToPercent } from '../../utils/window/timeToPercent';
import { ancestorChains } from '../../utils/ancestorChains';
import { selectionRelation } from '../../utils/selectionRelation';
import { familyStyle } from '../../utils/familyStyle';
import { viewWindow } from '../../utils/window/viewWindow';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';
import type { RowRef } from '../../../@types/rows/RowRef';
import type { Timeline } from '../../../@types/rows/Timeline';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import s from './TimelinePane.module.css';

type TimelinePaneProps = {
  readonly timeline: Timeline;
  /** The selected row, or the folded ancestor standing in for it. */
  readonly standIn: string | null;
  /** Null = fit. */
  readonly viewport: TimeWindow | null;
  readonly objects: ObjectIndex;
  /** The wheel listens here; the track gives it the time axis. */
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly trackRef: RefObject<HTMLDivElement | null>;
  readonly onSelectRow: (ref: RowRef) => void;
  readonly onToggleRow: (id: string) => void;
};

/** The outline beside its tracks: a header, then one row per visible step, each an outline cell and a lane. */
function TimelinePane({
  timeline,
  standIn,
  viewport,
  objects,
  rootRef,
  trackRef,
  onSelectRow,
  onToggleRow,
}: TimelinePaneProps) {
  const chains = useMemo(() => ancestorChains(timeline.rows), [timeline]);
  const window = viewWindow(viewport, timeline);
  const selectedIndex = timeline.rows.findIndex((row) => row.id === standIn);
  const end = timeline.durationSec === null ? null : timeToPercent(timeline.durationSec, window);

  return (
    <div ref={rootRef} className={s.root}>
      <div className={s.head}>
        <div className={s.headOutline}>
          <span className={s.headLabel}>Step</span>
          <span className={s.headLabel}>Value</span>
          <span className={cx(s.headLabel, s.dur)}>Dur</span>
          <span className={s.slots} aria-hidden>
            {CHANNEL_FAMILY_LEGEND.map(({ family, glyph }) => (
              <span key={family} className={s.slot} style={familyStyle(family)}>
                <Glyph id={glyph} size={12} />
              </span>
            ))}
          </span>
        </div>
        <RulerContainer timeline={timeline} window={window} />
      </div>
      <div className={s.rows} role="tree" aria-label="Steps">
        {timeline.rows.map((row, index) => {
          const relation = selectionRelation(timeline.rows, chains, index, selectedIndex);
          return (
            <div key={row.id} role="none" className={cx(s.row, row.id === standIn && s.selected)}>
              <OutlineRow
                row={row}
                ancestors={chains[index]!}
                selected={row.id === standIn}
                relation={relation}
                onSelect={() => onSelectRow(row.ref)}
                onToggle={() => onToggleRow(row.id)}
                objects={objects}
              />
              <TrackLane
                row={row}
                ancestors={chains[index]!}
                window={window}
                selectedId={standIn}
                contains={relation.contains}
                onSelect={() => onSelectRow(row.ref)}
                objects={objects}
              />
            </div>
          );
        })}
        {timeline.rows.length <= 1 && <p className={s.empty}>No steps</p>}
      </div>
      <div ref={trackRef} className={s.overlay} aria-hidden>
        {end !== null && (
          <>
            <span className={s.afterEnd} style={{ left: `${end}%` }} />
            <span className={s.endLine} style={{ left: `${end}%` }} />
          </>
        )}
        <PlayheadContainer window={window} />
      </div>
    </div>
  );
}

export default TimelinePane;
