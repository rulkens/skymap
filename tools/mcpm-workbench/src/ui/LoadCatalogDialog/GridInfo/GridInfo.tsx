/**
 * GridInfo — the Selection box Load will leave and what it costs the GPU: the
 * fitted box when `fitBounds` is given, the current one otherwise, both through
 * deriveGridBox (so the device's voxel floor shows) and the Stats estimates.
 * The GPU figure counts this file's points: a load switches the built-ins off.
 */
import type { ReactNode } from 'react';
import type { UserCatalogLoad } from '../../../../@types/UserCatalogLoad';
import { deriveGridBox } from '../../../field/deriveGridBox';
import { estimateBoxGpuBytes } from '../../../sim/estimateBoxGpuBytes';
import { estimateBoxGridBufferBytes } from '../../../sim/estimateBoxGridBufferBytes';
import { fittedGrid } from '../../../state/grid/fittedGrid';
import { useAppSelector } from '../../../store/hooks';
import { formatBytes } from '../../formatBytes';
import GpuBufferMeter from '../../GpuBufferMeter/GpuBufferMeter';
import { formatBoxSizeMpc } from '../utils/formatBoxSizeMpc';
import styles from './GridInfo.module.css';

export type GridInfoProps = {
  /** The file's rows; null while reading, or when the file could not be parsed. */
  readonly pointCount: number | null;
  readonly fitBounds: UserCatalogLoad['fitBounds'];
  readonly stale: boolean;
};

function GridInfo({ pointCount, fitBounds, stale }: GridInfoProps): ReactNode {
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const loadGrid = fitBounds ? fittedGrid(grid, fitBounds) : grid;
  const box = pointCount !== null && deriveGridBox(loadGrid);

  return (
    <div role="group" aria-label="Selection" className={styles.root} data-stale={stale}>
      <dl className={styles.list}>
        <dt className={styles.label}>voxels</dt>
        <dd className={styles.value}>{box ? box.dims.join(' × ') : '—'}</dd>
        <dt className={styles.label}>size</dt>
        <dd className={styles.value}>{box ? formatBoxSizeMpc(box.sizeMpc) : '—'}</dd>
        <dt className={styles.label}>GPU</dt>
        <dd className={styles.gpu}>
          <span>
            {pointCount !== null
              ? formatBytes(estimateBoxGpuBytes(loadGrid, agentCount, pointCount))
              : '—'}
          </span>
          {/* Always drawn, so the row keeps its height; a dash inside until the file is read. */}
          <span className={styles.meter} aria-hidden={pointCount !== null ? undefined : true}>
            <GpuBufferMeter
              usedBytes={estimateBoxGridBufferBytes(loadGrid)}
              limitBytes={pointCount !== null ? grid.maxBufferBytes : null}
            />
          </span>
        </dd>
      </dl>
    </div>
  );
}

export default GridInfo;
