/**
 * CameraBandBar — the regime band as one drawn object: a log-scale strip with
 * the four tunable edges as ticks and the camera's own h/R as a marker. Log,
 * because zoom is multiplicative — the same reason `ORIENT_TUNING.blendSpace`
 * defaults there. The domain is pinned to the ticks (not to the marker) so the
 * edges hold still while the camera flies; a marker outside it clamps to the
 * end and points off-scale. Percent offsets, not SVG: text in a stretched
 * viewBox distorts.
 */

import type { ReactElement } from 'react';
import styles from './CameraBandBar.module.css';

export type BandTick = {
  readonly label: string;
  readonly hOverR: number;
};

export type CameraBandBarProps = {
  /** The band edges, any order — the bar sorts them for placement and stagger. */
  readonly ticks: readonly BandTick[];
  readonly hOverR: number | null;
  /** Pre-formatted marker caption; the bar does no unit maths. */
  readonly markerLabel: string;
};

/** Two decades of headroom either side keeps every default edge well inboard. */
const DOMAIN_PAD = 4;

function percentOf(value: number, minHR: number, maxHR: number): number {
  const span = Math.log(maxHR) - Math.log(minHR);
  return ((Math.log(value) - Math.log(minHR)) / span) * 100;
}

function CameraBandBar({ ticks, hOverR, markerLabel }: CameraBandBarProps): ReactElement {
  const sorted = [...ticks].sort((a, b) => a.hOverR - b.hOverR);
  const minHR = sorted[0]!.hOverR / DOMAIN_PAD;
  const maxHR = sorted[sorted.length - 1]!.hOverR * DOMAIN_PAD;

  const raw = hOverR === null || hOverR <= 0 ? null : percentOf(hOverR, minHR, maxHR);
  const clamped = raw === null ? null : Math.max(0, Math.min(100, raw));
  const offScale = raw === null ? '' : raw < 0 ? '‹ ' : raw > 100 ? '› ' : '';

  return (
    <div className={styles.root}>
      <div className={styles.track}>
        {sorted.map((tick, i) => (
          <div
            key={tick.label}
            className={i % 2 === 0 ? styles.tickLow : styles.tickHigh}
            style={{ left: `${percentOf(tick.hOverR, minHR, maxHR)}%` }}
          >
            <span className={styles.tickLabel}>{tick.label}</span>
          </div>
        ))}
        {clamped === null ? null : (
          <div className={styles.marker} style={{ left: `${clamped}%` }}>
            <span className={styles.markerLabel}>
              {offScale}
              {markerLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraBandBar;
