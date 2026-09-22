/**
 * MemorySection — live readout of the GPU-memory ledger (`trackGpuMemory.ts`)
 * plus JS heap, polled at 1 Hz. Measure-only: no controls, nothing here can
 * change what's resident. `gc'd` flags an owner whose objects were reclaimed
 * by GC without an explicit `destroy()` — the leak signal the ledger exists
 * to surface.
 */

import { Fragment, useEffect, useState, type ReactElement } from 'react';
import type { GpuMemorySnapshot } from '../../@types/gpu/memory/GpuMemorySnapshot';
import { jsHeapBytes } from '../../utils/perf/jsHeapBytes';
import DebugSection from './DebugSection';
import styles from './MemorySection.module.css';

export type MemorySectionProps = {
  readonly gpuMemory: () => GpuMemorySnapshot;
};

const POLL_MS = 1000;
const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

function MemorySection({ gpuMemory }: MemorySectionProps): ReactElement {
  const [snap, setSnap] = useState<GpuMemorySnapshot>(gpuMemory);
  const [heapBytes, setHeapBytes] = useState<number | null>(jsHeapBytes);

  useEffect(() => {
    const id = setInterval(() => {
      setSnap(gpuMemory());
      setHeapBytes(jsHeapBytes());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [gpuMemory]);

  const title =
    `Memory — GPU ${mb(snap.totalBytes)} MB` +
    (heapBytes === null ? '' : ` · heap ${mb(heapBytes)} MB`);

  return (
    <DebugSection title={title}>
      {snap.owners.length === 0 ? (
        <div className={styles.notice}>No GPU allocations tracked yet.</div>
      ) : (
        <div className={styles.table}>
          <span className={styles.head}>owner</span>
          <span className={styles.head}>count</span>
          <span className={styles.head}>MB</span>
          <span className={styles.head}>gc&apos;d</span>
          {snap.owners.map((row) => (
            <Fragment key={row.owner}>
              <span className={styles.name}>{row.owner}</span>
              <span className={styles.number}>{row.count}</span>
              <span className={styles.number}>{mb(row.bytes)}</span>
              <span className={styles.number}>{row.gcReclaimed > 0 ? row.gcReclaimed : ''}</span>
            </Fragment>
          ))}
        </div>
      )}
    </DebugSection>
  );
}

export default MemorySection;
