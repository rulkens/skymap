/**
 * GpuBufferMeter — the sim's total memory for the box as set, against the largest
 * single buffer the device allows (WebGPU reports no total memory), so the used
 * number can pass the limit; the fill then stops at full. A read-only gauge with
 * "used / limit" inside at the start, so the text never moves as the fill grows;
 * the zone tints the fill, and the fill's length and the two numbers say the
 * same without colour. Before the limit is known the gauge is empty and
 * the text a dash.
 */
import type { CSSProperties, ReactNode } from 'react';
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
    <div
      className={styles.root}
      data-zone={reading?.zone}
      style={{ '--fill': reading?.fill ?? 0 } as CSSProperties}
      role="meter"
      aria-label="Sim memory"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={reading?.fill ?? 0}
      aria-valuetext={pair ? `${pair} used of the device limit` : 'Device limit not known yet'}
    >
      <div className={styles.fill} />
      <span className={styles.value} aria-hidden="true">
        {pair ?? '—'}
      </span>
    </div>
  );
}

export default GpuBufferMeter;
