/*
 * DomeMarks — how a technician reads a dome-mode frame, drawn over it: the zenith at the centre, a scale of
 * heights above the horizon along one radius, the circle at the focus's height and the front of the dome
 * at the bottom edge. The frame is equidistant, so the scale's ticks are evenly spaced and a height is a
 * fixed share of the radius. Lies over a Disc in a box of its size; the sky turns under it, the marks stay.
 */
import { FOCUS_HEIGHT_DEG, FOCUS_SHARE, R, TICKS_PATH } from './DomeMarks.constants.ts';
import styles from './DomeMarks.module.css';

function DomeMarks() {
  return (
    <div className={styles.root}>
      <svg className={styles.lines} viewBox="0 0 200 200" aria-hidden="true">
        <path d={`M0 ${R}H${R + 6}M${R} ${R - 6}v12M${R} ${2 * R - 4}v12`} />
        <path d={TICKS_PATH} />
        <circle className={styles.dashed} cx={R} cy={R} r={R * FOCUS_SHARE} />
      </svg>
      <span className={styles.zenith}>Zenith</span>
      <span className={styles.focus} style={{ top: `${50 * (1 - FOCUS_SHARE)}%` }}>
        {`${FOCUS_HEIGHT_DEG}° above the horizon`}
      </span>
      <span className={styles.front}>Front of the dome</span>
    </div>
  );
}

export default DomeMarks;
