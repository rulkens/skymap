/**
 * GridInfo — the Selection box Load will leave and what it costs the GPU: the
 * fitted box when `fitBounds` is given, the current one otherwise, both through
 * deriveGridBox (so the device's voxel floor shows) and the Stats estimates.
 * The memory counts this file's points: a load switches the built-ins off. The
 * fit gets the same lanes Load gives it, so a voxel size raised to fit memory
 * shows here as it will be stored.
 */
import type { ReactNode } from 'react';
import CompactInfoTip from '../../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import type { UserCatalogLoad } from '../../../../@types/UserCatalogLoad';
import { deriveGridBox } from '../../../field/deriveGridBox';
import { estimateBoxGpuBytes } from '../../../sim/estimateBoxGpuBytes';
import { fittedGrid } from '../../../state/grid/fittedGrid';
import { useAppSelector } from '../../../store/hooks';
import { formatBytes } from '../../formatBytes';
import GpuBufferMeter from '../../GpuBufferMeter/GpuBufferMeter';
import { formatVoxelSizeMpc } from '../../GridBoxPanel/utils/formatVoxelSizeMpc';
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
  const lanes = { agentCount, pointCount: pointCount ?? 0 };
  const loadGrid = fitBounds ? fittedGrid(grid, fitBounds, lanes) : grid;
  const box = pointCount !== null ? deriveGridBox(loadGrid) : null;
  const raised = fitBounds !== null && loadGrid.manualVoxelSizeMpc !== grid.manualVoxelSizeMpc;
  const memoryBytes = estimateBoxGpuBytes(loadGrid, agentCount, lanes.pointCount);

  return (
    <div role="group" aria-label="Selection" className={styles.root} data-stale={stale}>
      <dl className={styles.list}>
        <dt className={styles.label}>voxels</dt>
        <dd className={styles.voxels}>
          <span>{box ? box.dims.join(' × ') : '—'}</span>
          <span>{box ? formatVoxelSizeMpc(box.voxelSizeMpc) : ''}</span>
          {/* The slot is always there, so the tip appearing moves nothing. */}
          <span className={styles.tip}>
            {box && raised && (
              <CompactInfoTip label="Raised to fit GPU memory." align="end">
                <button type="button" className={styles.tipIcon} aria-label="About voxel size">
                  ⓘ
                </button>
              </CompactInfoTip>
            )}
          </span>
        </dd>
        <dt className={styles.label}>size</dt>
        <dd className={styles.value}>{box ? formatBoxSizeMpc(box.sizeMpc) : '—'}</dd>
        <dt className={styles.label}>GPU</dt>
        <dd className={styles.gpu}>
          <span>{pointCount !== null ? formatBytes(memoryBytes) : '—'}</span>
          {/* Always drawn, so the row keeps its height; a dash inside until the file is read. */}
          <span className={styles.meter} aria-hidden={pointCount !== null ? undefined : true}>
            <GpuBufferMeter
              usedBytes={memoryBytes}
              limitBytes={pointCount !== null ? grid.maxBufferBytes : null}
            />
          </span>
        </dd>
      </dl>
    </div>
  );
}

export default GridInfo;
