/**
 * StatsReadout — the diagnostic readout the spec requires AT ALL TIMES: point
 * count, NaN-fill count and fraction, resolved GridElement, summed byte budget,
 * step counter, fps. The NaN fraction is the one number that says what a
 * median-filled fit stands on (spec §6), so it sits in the data sidebar's
 * pinned block, never behind a fold. fps is Viewport's own throttled push.
 */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../store/hooks';
import { formatBytes } from '../formatBytes';
import styles from './StatsReadout.module.css';

function StatsReadout(): ReactNode {
  const catalog = useAppSelector((s) => s.catalog);
  const grid = useAppSelector((s) => s.grid);
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  const fps = useAppSelector((s) => s.view.fps);

  const nanFraction = catalog.pointCount > 0 ? catalog.nanFillCount / catalog.pointCount : 0;
  const stats: readonly (readonly [string, string])[] = [
    ['points', catalog.pointCount.toLocaleString()],
    ['NaN fill', `${catalog.nanFillCount.toLocaleString()} (${(nanFraction * 100).toFixed(1)}%)`],
    ['element', grid.resolvedElement ?? '—'],
    ['budget', grid.byteBudget ? formatBytes(grid.byteBudget.totalBytes) : '—'],
    ['step', stepCount.toLocaleString()],
    ['fps', fps === 0 ? '—' : String(fps)],
  ];

  return (
    <dl className={styles.root}>
      {stats.map(([label, value]) => (
        <div key={label} className={styles.stat}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default StatsReadout;
