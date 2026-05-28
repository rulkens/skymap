// src/components/Splash/SplashProgress.tsx
/**
 * SplashProgress — 1 px hairline at the viewport's bottom edge plus a
 * single line of mono text above it. Replaces the inline ProgressRow
 * that lived inside the old splash card.
 *
 * Lives at the viewport edge, not inside the splash column, so the
 * bar spans the full width of the screen and the count text sits
 * centred regardless of the splash's bottom-left placement.
 *
 * Indeterminate when the aggregator hasn't reported a non-zero total
 * yet — falls back to a sliding gradient and a bare "Loading…" label.
 */

import type { ReactNode } from 'react';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './SplashProgress.module.css';

export type SplashProgressProps = {
  readonly progress: LoadProgressState | null | undefined;
};

function formatMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

function SplashProgress({ progress }: SplashProgressProps): ReactNode {
  if (!progress) return null;
  const indeterminate = progress.totalBytes === 0;
  const fraction = indeterminate
    ? 0
    : Math.min(1, progress.loadedBytes / progress.totalBytes);
  const pct = Math.round(fraction * 100);
  return (
    <div
      className={styles.root}
      role="progressbar"
      aria-label="Loading galaxy data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
    >
      <div className={styles.text}>
        {indeterminate
          ? 'Loading…'
          : `Loading… ${formatMB(progress.loadedBytes)} / ${formatMB(progress.totalBytes)} MB`}
      </div>
      <div className={styles.line}>
        {indeterminate ? (
          <div className={styles.indeterminate} />
        ) : (
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

export default SplashProgress;
