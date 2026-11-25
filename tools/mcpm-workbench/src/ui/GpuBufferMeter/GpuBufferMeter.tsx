/**
 * GpuBufferMeter — the largest grid buffer of the box as set, against the largest
 * single buffer the device allows (WebGPU reports no total memory). The zone shows
 * in the bar, the text colour and the percentage, so it never rests on colour.
 * Before the limit is known the bar is empty and the text a dash, in the same
 * fixed-width slots, so nothing moves between states or while a size drags.
 */
import type { ReactNode } from 'react';
import { formatBytePair } from './utils/formatBytePair';
import { gpuBufferReading } from './utils/gpuBufferReading';
import styles from './GpuBufferMeter.module.css';

type Props = {
  readonly usedBytes: number;
  readonly limitBytes: number | null;
};

function GpuBufferMeter({ usedBytes, limitBytes }: Props): ReactNode {
  const reading = gpuBufferReading(usedBytes, limitBytes);
  const pair = reading && limitBytes !== null ? formatBytePair(usedBytes, limitBytes) : null;

  return (
    <div className={styles.root} data-zone={reading?.zone}>
      <div
        className={styles.track}
        role="meter"
        aria-label="Largest grid buffer"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={reading ? Math.min(100, reading.percent) : 0}
        aria-valuetext={
          reading
            ? `${pair}, ${reading.percent}% of the device limit`
            : 'Device limit not known yet'
        }
      >
        <div className={styles.fill} style={{ inlineSize: `${(reading?.fill ?? 0) * 100}%` }} />
      </div>
      <span className={styles.pair} aria-hidden="true">
        {pair ?? '—'}
      </span>
      <span className={styles.percent} aria-hidden="true">
        {reading ? `${reading.percent}%` : ''}
      </span>
    </div>
  );
}

export default GpuBufferMeter;
