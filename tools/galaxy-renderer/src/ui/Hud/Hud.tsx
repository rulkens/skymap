/**
 * Hud — top-left title block + live telemetry badges (html:44-54).
 *
 * Purely presentational. `perf`/`stars`/`dust` are engine telemetry `App`
 * samples off `Viewport`'s `onPerf`/`onStats` callbacks and keeps in local
 * `useState` — routing them through the store would mean a Redux dispatch
 * twice a second for values nothing outside this pill reads.
 *
 * The badge leads with milliseconds and puts fps second. Frame time is the
 * quantity that moves linearly with the work a change adds or removes, so it
 * is the one to compare between two variants; fps is the same measurement
 * compressed through a reciprocal, useful only for "am I still smooth". The
 * per-pass GPU spans below the badges are a further step removed — see
 * `PassTimings`.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import type { PerfReport } from '../../../@types/engine/PerfReport';
import PassTimings from '../PassTimings/PassTimings';
import styles from './Hud.module.css';

export type HudProps = {
  readonly perf: PerfReport;
  readonly stars: number;
  readonly dust: number;
};

const FRAME_MS_GOOD_THRESHOLD = 1000 / 55; // html:815 — the old 55 fps line, in ms

function formatCount(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function Hud({ perf, stars, dust }: HudProps): ReactNode {
  // A zero frameMs means the median has no samples yet (first half-second);
  // treat that as good rather than flashing the warn colour on boot.
  const frameGood = perf.frameMs === 0 || perf.frameMs <= FRAME_MS_GOOD_THRESHOLD;
  return (
    <div className={styles.root}>
      <div className={styles.eyebrow}>WEBGPU · PARAMETRIC</div>
      <div className={styles.title}>Galaxy Renderer</div>
      <div className={styles.badges}>
        <span className={cx(styles.fpsPill, frameGood ? styles.fpsGood : styles.fpsWarn)}>
          {perf.frameMs.toFixed(2)} ms · {Math.round(perf.fps)} fps
        </span>
        <span className={styles.badge}>{formatCount(stars)} stars</span>
        <span className={styles.badge}>{formatCount(dust)} dust</span>
      </div>
      <PassTimings passes={perf.passes} enabled={perf.timingEnabled} />
    </div>
  );
}

export default Hud;
