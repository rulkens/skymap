/**
 * StatsReadout — the run at a glance, in the data sidebar's pinned block: the
 * galaxies loaded (before the box keeps those inside it), how far the fit has run,
 * whether it runs smoothly, and the GPU memory of the box as set, live while a
 * size slider drags: the total, and the same total against the device's buffer limit.
 * A row without a usable weight gets the median (spec §6); zero is the normal
 * case, so that count shows only when there is some, in the warning colour, after
 * the galaxies value: a slot that is always there, so nothing moves.
 */
import type { ReactNode } from 'react';
import { formatBytes } from '../../../utils/format/formatBytes';
import { formatFps } from '../../../utils/format/formatFps';
import GpuBufferMeter from '../GpuBufferMeter/GpuBufferMeter';
import PanelRow from '../../panel/PanelRow/PanelRow';
import styles from './StatsReadout.module.css';

export type StatsReadoutProps = {
  readonly pointCount: number;
  readonly nanFillCount: number;
  readonly stepCount: number;
  readonly fps: number;
  readonly gpuBytes: number;
  readonly maxBufferBytes: number | null;
};

function StatsReadout({
  pointCount,
  nanFillCount,
  stepCount,
  fps,
  gpuBytes,
  maxBufferBytes,
}: StatsReadoutProps): ReactNode {
  return (
    <>
      <dl className={styles.root}>
        <div className={styles.cell}>
          <dt className={styles.label}>galaxies</dt>
          <dd className={styles.value}>{pointCount.toLocaleString()}</dd>
          {nanFillCount > 0 && (
            <dd
              className={styles.warn}
              title="Rows without a usable weight, filled with the median weight"
            >
              {nanFillCount.toLocaleString()} NaN
            </dd>
          )}
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>step</dt>
          <dd className={styles.value}>{stepCount.toLocaleString()}</dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>frame rate</dt>
          <dd className={styles.value}>{fps === 0 ? '—' : formatFps(fps)}</dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>GPU memory</dt>
          <dd className={styles.value}>{formatBytes(gpuBytes)}</dd>
        </div>
      </dl>
      <PanelRow infoName="memory used for simulation" info="Memory used for simulation.">
        <GpuBufferMeter usedBytes={gpuBytes} limitBytes={maxBufferBytes} />
      </PanelRow>
    </>
  );
}

export default StatsReadout;
