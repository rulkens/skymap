/**
 * StatsReadout — the run at a glance, in the data sidebar's pinned block: the
 * galaxies loaded (before the box keeps those inside it), how far the fit has run,
 * whether it runs smoothly, and the GPU memory of the box as set, live while a
 * size slider drags: the total, and its largest grid buffer against the device limit.
 * A row without a usable weight gets the median (spec §6); zero is the normal
 * case, so that count shows only when there is some, in the warning colour, after
 * the galaxies value: a slot that is always there, so nothing moves.
 */
import type { ReactNode } from 'react';
import { estimateBoxGpuBytes } from '../../sim/estimateBoxGpuBytes';
import { estimateBoxGridBufferBytes } from '../../sim/estimateBoxGridBufferBytes';
import { useAppSelector } from '../../store/hooks';
import { formatBytes } from '../formatBytes';
import GpuBufferMeter from '../GpuBufferMeter/GpuBufferMeter';
import PanelRow from '../PanelRow/PanelRow';
import styles from './StatsReadout.module.css';

function StatsReadout(): ReactNode {
  const pointCount = useAppSelector((s) => s.catalog.pointCount);
  const nanFillCount = useAppSelector((s) => s.catalog.nanFillCount);
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  const fps = useAppSelector((s) => s.view.fps);

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
          <dd className={styles.value}>{fps === 0 ? '—' : `${fps} fps`}</dd>
        </div>
        <div className={styles.cell}>
          <dt className={styles.label}>GPU memory</dt>
          <dd className={styles.value}>
            {formatBytes(estimateBoxGpuBytes(grid, agentCount, pointCount))}
          </dd>
        </div>
      </dl>
      <PanelRow
        infoName="largest grid buffer"
        info="The largest grid buffer of the box as set, against the largest single buffer this device allows."
      >
        <GpuBufferMeter
          usedBytes={estimateBoxGridBufferBytes(grid)}
          limitBytes={grid.maxBufferBytes}
        />
      </PanelRow>
    </>
  );
}

export default StatsReadout;
