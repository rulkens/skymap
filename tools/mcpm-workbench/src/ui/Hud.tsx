/**
 * Hud — the tool's title block plus the diagnostic readout the spec requires
 * AT ALL TIMES: point count, NaN-fill count and fraction, resolved
 * GridElement, summed byte budget, step counter, fps. The NaN fraction is
 * the one number that says what a median-filled fit stands on (spec §6), so
 * it's never hidden behind a toggle. Read-only: every value comes straight
 * off the store — fps is Viewport's own throttled push, not measured here.
 */
import type { ReactNode } from 'react';
import { useStore } from '../state/useStore';
import { useAppStore } from './storeContext';
import styles from './Hud.module.css';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

function Hud(): ReactNode {
  const store = useAppStore();
  const catalog = useStore(store, (s) => s.catalog);
  const grid = useStore(store, (s) => s.grid);
  const stepCount = useStore(store, (s) => s.sim.stepCount);
  const fps = useStore(store, (s) => s.view.fps);

  const nanFraction = catalog.pointCount > 0 ? catalog.nanFillCount / catalog.pointCount : 0;

  return (
    <div className={styles.root}>
      <div className={styles.eyebrow}>SKYMAP · WEBGPU</div>
      <div className={styles.title}>MCPM Workbench</div>
      <div className={styles.badges}>
        <div className={styles.badge}>
          <span className={styles.label}>points</span>
          <span className={styles.value}>{catalog.pointCount.toLocaleString()}</span>
        </div>
        <div className={styles.badge}>
          <span className={styles.label}>NaN fill</span>
          <span className={styles.value}>
            {catalog.nanFillCount.toLocaleString()} ({(nanFraction * 100).toFixed(1)}%)
          </span>
        </div>
        <div className={styles.badge}>
          <span className={styles.label}>element</span>
          <span className={styles.value}>{grid.resolvedElement ?? '—'}</span>
        </div>
        <div className={styles.badge}>
          <span className={styles.label}>budget</span>
          <span className={styles.value}>
            {grid.byteBudget ? formatBytes(grid.byteBudget.totalBytes) : '—'}
          </span>
        </div>
        <div className={styles.badge}>
          <span className={styles.label}>step</span>
          <span className={styles.value}>{stepCount.toLocaleString()}</span>
        </div>
        <div className={styles.badge}>
          <span className={styles.label}>fps</span>
          <span className={styles.value}>{fps === 0 ? '—' : fps}</span>
        </div>
      </div>
    </div>
  );
}

export default Hud;
