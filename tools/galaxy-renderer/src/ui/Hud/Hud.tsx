/**
 * Hud — top-left title block + live telemetry badges (html:44-54).
 *
 * Purely presentational. `fps`/`stars`/`dust` are per-frame numbers `App`
 * samples off `Viewport`'s `onFps`/`onStats` callbacks and keeps in local
 * `useState` — routing them through the store would mean a Redux dispatch
 * every frame for values nothing outside this pill reads.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import styles from './Hud.module.css';

export type HudProps = {
  readonly fps: number;
  readonly stars: number;
  readonly dust: number;
};

const FPS_GOOD_THRESHOLD = 55; // html:815

function formatCount(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function Hud({ fps, stars, dust }: HudProps): ReactNode {
  const fpsGood = fps >= FPS_GOOD_THRESHOLD;
  return (
    <div className={styles.root}>
      <div className={styles.eyebrow}>WEBGPU · PARAMETRIC</div>
      <div className={styles.title}>Galaxy Renderer</div>
      <div className={styles.badges}>
        <span className={cx(styles.fpsPill, fpsGood ? styles.fpsGood : styles.fpsWarn)}>
          {fps} FPS
        </span>
        <span className={styles.badge}>{formatCount(stars)} stars</span>
        <span className={styles.badge}>{formatCount(dust)} dust</span>
      </div>
    </div>
  );
}

export default Hud;
