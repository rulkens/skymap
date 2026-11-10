import { useMemo, useRef } from 'react';
import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import OutlineRow from '../OutlineRow/OutlineRow';
import TrackLane from '../TrackLane/TrackLane';
import { CHANNEL_FAMILY_LEGEND } from '../../../data/channelFamilies';
import { rowSelected, rowToggled } from '../../../session/state/studioSlice';
import { selectPlayheadSec, selectViewport } from '../../../session/state/selectors';
import Playhead from '../Playhead/Playhead';
import Ruler from '../Ruler/Ruler';
import { timeToPercent } from '../../utils/window/timeToPercent';
import { selectSelectionStandInId } from '../../state/selectSelectionStandInId';
import { selectTimeline } from '../../state/selectTimeline';
import { ancestorChains } from '../../utils/ancestorChains';
import { selectionRelation } from '../../utils/selectionRelation';
import { familyStyle } from '../../utils/familyStyle';
import { viewWindow } from '../../utils/window/viewWindow';
import { useTimelineWheel } from './useTimelineWheel';
import { useAppDispatch, useAppSelector } from '../../../../../../src/store/hooks';
import s from './TimelinePane.module.css';

/** The outline beside its tracks: a header, then one row per visible step, each an outline cell and a lane. */
function TimelinePane() {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector(selectTimeline);
  const standIn = useAppSelector(selectSelectionStandInId);
  const viewport = useAppSelector(selectViewport);
  const playheadSec = useAppSelector(selectPlayheadSec);
  const chains = useMemo(() => ancestorChains(timeline?.rows ?? []), [timeline]);
  const track = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useTimelineWheel(root, track, timeline !== null);
  if (timeline === null) return null;
  const window = viewWindow(viewport, timeline);
  const selectedIndex = timeline.rows.findIndex((row) => row.id === standIn);
  const end = timeline.durationSec === null ? null : timeToPercent(timeline.durationSec, window);

  return (
    <div ref={root} className={s.root}>
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
        <Ruler timeline={timeline} window={window} playheadSec={playheadSec} />
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
                onSelect={() => dispatch(rowSelected(row.ref))}
                onToggle={() => dispatch(rowToggled(row.id))}
              />
              <TrackLane
                row={row}
                ancestors={chains[index]!}
                window={window}
                selected={row.id === standIn}
                selectedId={standIn}
                contains={relation.contains}
                onSelect={() => dispatch(rowSelected(row.ref))}
              />
            </div>
          );
        })}
        {timeline.rows.length <= 1 && <p className={s.empty}>No steps</p>}
      </div>
      <div ref={track} className={s.overlay} aria-hidden>
        {end !== null && (
          <>
            <span className={s.afterEnd} style={{ left: `${end}%` }} />
            <span className={s.endLine} style={{ left: `${end}%` }} />
          </>
        )}
        <Playhead playheadSec={playheadSec} window={window} />
      </div>
    </div>
  );
}

export default TimelinePane;
