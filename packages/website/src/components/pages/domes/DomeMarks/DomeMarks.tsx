/*
 * DomeMarks — how a technician reads a dome-mode frame, drawn over it: the zenith at the centre, a scale of
 * heights above the horizon along one radius, the circle at the focus's height and the front of the dome
 * at the bottom edge. The frame is equidistant, so the scale's ticks are evenly spaced and a height is a
 * fixed share of the radius; the circle is placed from the app's own tilt, so the drawing moves with the
 * app if the tilt ever does. Lies over a Disc in a box of its size; the sky turns under it, the marks stay.
 */
import { DOME_PARAMS } from '../../../../../../../src/data/rendering/domeParams';
import styles from './DomeMarks.module.css';

// The focus is `tiltDeg` from the zenith, and the rim is 90 degrees from it.
const FOCUS_SHARE = DOME_PARAMS.tiltDeg / 90;
const FOCUS_HEIGHT_DEG = 90 - DOME_PARAMS.tiltDeg;
const R = 100;
// A tick every ten degrees of height, from the horizon (the rim) to the zenith; the focus's height is longer.
const TICKS = Array.from({ length: 9 }, (_, i) => i * 10);
const tickPath = (height: number) => {
  const x = R - (R * (90 - height)) / 90;
  const half = height % 30 === 0 ? 4 : 2;
  return `M${x} ${R - half}v${2 * half}`;
};

function DomeMarks() {
  return (
    <div className={styles.root}>
      <svg className={styles.lines} viewBox="0 0 200 200" aria-hidden="true">
        <path d={`M0 ${R}H${R + 6}M${R} ${R - 6}v12M${R} ${2 * R - 4}v12`} />
        <path d={TICKS.map(tickPath).join('')} />
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
