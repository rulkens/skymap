/**
 * FrameStatsRow — the DebugPanel's always-on fps + CPU-frame-time readout.
 *
 * Unlike GpuTimingsSection (dark unless `?gpuTimings` is set and the adapter
 * supports timestamp-query), this row is shown at ALL times: the numbers come
 * from a pure CPU-side measurement of the JS frame body, so there's nothing to
 * gate on. It sits above GpuTimingsSection precisely so the panel is never blank.
 *
 * ### Why poll, not subscribe per-frame
 *
 * The stats update every rendered frame (up to 60 Hz), but a human reads a
 * numeric readout a few times a second at most. Subscribing per-frame would
 * force ~60 React re-renders/second for two numbers; instead we poll the
 * `frameStats()` getter on a 4 Hz `setInterval` into local state. That's plenty
 * responsive for a readout and keeps React churn negligible. The interval is
 * cleared on unmount so a closed panel does no work.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { FrameStats } from '../../@types/engine/FrameStats';
import styles from './FrameStatsRow.module.css';

export type FrameStatsRowProps = {
  frameStats: () => FrameStats;
};

const POLL_MS = 250;

export function FrameStatsRow({ frameStats }: FrameStatsRowProps): ReactElement {
  const [stats, setStats] = useState<FrameStats>(frameStats);

  useEffect(() => {
    const id = setInterval(() => setStats(frameStats()), POLL_MS);
    return () => clearInterval(id);
  }, [frameStats]);

  return (
    <div className={styles.root}>
      {stats.idle
        ? `FPS —  ·  CPU ${stats.cpuMs.toFixed(1)} ms  (idle)`
        : `FPS ${stats.fps}  ·  CPU ${stats.cpuMs.toFixed(1)} ms`}
    </div>
  );
}
