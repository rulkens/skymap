import { useMemo } from 'react';
import cx from 'classnames';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import { formatQuantity } from '../../../utils/format/formatQuantity';
import { formatTimecode } from '../../../utils/format/formatTimecode';
import { familyStyle } from '../../utils/familyStyle';
import { formatTickLabel } from '../../utils/ruler/formatTickLabel';
import { labelUnderHead } from '../../utils/ruler/labelUnderHead';
import { rulerSteps } from '../../utils/ruler/rulerSteps';
import { timeToPercent } from '../../utils/window/timeToPercent';
import { AFTER_END_CAPTION_PX, EPSILON, HEAD_WIDTH_PX, TICK_LABEL_PX } from './Ruler.constants';
import { useRulerScrub } from './useRulerScrub';
import { selectPlayheadSec } from '../../../session/state/selectors';
import { useAppSelector } from '../../../../../../src/store/hooks';
import { useTrackWidth } from './useTrackWidth';
import type { TimeWindow } from '../../../@types/session/TimeWindow';
import type { ChannelFamily } from '../../../@types/rows/ChannelFamily';
import type { Timeline } from '../../../@types/rows/Timeline';
import s from './Ruler.module.css';

type Props = {
  readonly timeline: Timeline;
  readonly window: TimeWindow;
};

/** The time axis: ticks, a notch per cue in its channel's tint, the End flag and the playhead's readout. Click or drag to seek. */
function Ruler({ timeline, window }: Props) {
  const playheadSec = useAppSelector(selectPlayheadSec);
  const { ref, ...handlers } = useRulerScrub(window, timeline.cueSecs);
  const trackPx = useTrackWidth(ref);
  const span = window.endSec - window.startSec;
  const { major, minor } = rulerSteps(span, trackPx);
  const first = Math.ceil(window.startSec / minor - EPSILON);
  const ticks = Array.from(
    { length: Math.max(0, Math.floor(window.endSec / minor + EPSILON) - first + 1) },
    (_, i) => (first + i) * minor,
  );
  // A notch takes the tint of the first channel row starting there; groups have none.
  const familyAt = useMemo(() => {
    const found = new Map<number | null, ChannelFamily>();
    for (const row of timeline.rows)
      if (row.family !== null && !found.has(row.startSec)) found.set(row.startSec, row.family);
    return found;
  }, [timeline.rows]);
  const { durationSec, loop } = timeline;
  // The caption marks the zone past End, so it shows only when End is inside the window.
  const afterEndShown = durationSec !== null && durationSec < window.endSec;
  const at = (sec: number) => ({ left: `${timeToPercent(sec, window)}%` });
  const headPx = timeToPercent(playheadSec, window) * (trackPx / 100);
  let labelled = false;

  return (
    <div ref={ref} className={s.root} {...handlers} aria-label="Timeline ruler">
      {ticks.map((sec) => {
        const isMajor = Math.abs(sec / major - Math.round(sec / major)) < EPSILON;
        const tickPx = timeToPercent(sec, window) * (trackPx / 100);
        const clipsCaption =
          afterEndShown && tickPx + TICK_LABEL_PX > trackPx - AFTER_END_CAPTION_PX;
        const showLabel =
          isMajor && !clipsCaption && !labelUnderHead(tickPx, TICK_LABEL_PX, headPx, HEAD_WIDTH_PX);
        const label = showLabel && formatTickLabel(sec, !labelled);
        if (showLabel) labelled = true;
        return (
          <span key={sec} className={cx(s.tick, isMajor && s.major)} style={at(sec)}>
            {label && <span className={s.tickLabel}>{label}</span>}
          </span>
        );
      })}
      {timeline.cueSecs
        .filter((sec) => sec >= window.startSec && sec <= window.endSec)
        .map((sec) => (
          <span
            key={sec}
            className={s.notch}
            style={{ ...at(sec), ...familyStyle(familyAt.get(sec) ?? null) }}
          />
        ))}
      {durationSec !== null && (
        <>
          <span className={s.end} style={at(durationSec)}>
            {loop ? (
              <>
                <Glyph id="loop" size={12} />
                Loop
              </>
            ) : (
              `End ${formatQuantity(durationSec, 's')}`
            )}
          </span>
          {afterEndShown && <span className={s.after}>after end</span>}
        </>
      )}
      <span
        className={s.head}
        style={{ left: `max(${timeToPercent(playheadSec, window)}%, var(--head-inset))` }}
      >
        {formatTimecode(playheadSec)}
      </span>
    </div>
  );
}

export default Ruler;
