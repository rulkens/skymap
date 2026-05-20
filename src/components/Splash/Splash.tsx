// src/components/Splash/Splash.tsx
/**
 * Splash — first-paint loading curtain + onboarding dialog.
 *
 * Renders a translucent card centered over a full-viewport dim overlay.
 * Two CTAs (Explore primary, Tour secondary), a progress indicator while
 * loading, a "Continue anyway" escape after 8 s of waiting, and per-error
 * rendering for the three runtime failure modes.
 *
 * ### Why presentational
 *
 * All state lives in `useSplash` (the hook).  This component takes only
 * the rendered state + handlers as props.  That split keeps the dialog
 * trivially testable (just feed it prop combinations) and lets the
 * hook be tested independently with renderHook.
 *
 * ### Accessibility
 *
 * `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the title,
 * `aria-describedby` to the body.  The background canvas is marked
 * `aria-hidden="true"` from App.tsx while the splash is up.  Focus trap
 * and Esc handling are added in Task 9 (this file keeps the markup +
 * presentation contract separate from the trap logic).
 *
 * ### Failure rendering
 *
 * - `webgpu-init-failed`  → swap CTAs for an error box explaining the
 *                            requestAdapter failure.  Reload button only.
 * - `catalog-fetch-failed` → CTAs hidden; error box + Reload.
 * - `famous-meta-failed`  → CTAs stay; Tour is disabled with a `title`
 *                            tooltip; Explore is unaffected.
 *
 * The synchronous "no navigator.gpu" path is handled in main.tsx before
 * React mounts; the splash never sees that case.
 */

import { type ReactNode } from 'react';
import cx from 'classnames';
import type { SplashError } from '../../@types/splash/SplashError';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './Splash.module.css';

export type SplashProps = {
  /** True while loading is incomplete; disables CTAs. */
  blocked: boolean;
  /** True after the 8 s "Continue anyway" timer has fired. */
  canContinueAnyway: boolean;
  /** Optional load progress to render below the body (null hides the row). */
  loadProgress?: LoadProgressState | null;
  /** Current error state; null on the happy path. */
  error: SplashError | null;
  /** Called when the user clicks Explore (or Esc — wired in Task 9). */
  onExplore: () => void;
  /** Called when the user clicks Tour. */
  onTour: () => void;
  /** Called when the user clicks the Continue anyway escape link. */
  onContinueAnyway: () => void;
  /** Called when the user clicks Reload (catalog-fetch-failed / webgpu-init-failed). */
  onReload: () => void;
};

const TITLE_ID = 'splash-title';
const BODY_ID = 'splash-body';

function ProgressRow({ progress }: { progress: LoadProgressState | null | undefined }): ReactNode {
  if (!progress) return null;
  const indeterminate = progress.totalBytes === 0;
  const fraction =
    progress.totalBytes > 0 ? Math.min(1, progress.loadedBytes / progress.totalBytes) : 0;
  return (
    <div
      className={styles.progressRow}
      role="progressbar"
      aria-label="Loading galaxy data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(fraction * 100)}
    >
      <div className={styles.progressTrack}>
        {indeterminate ? (
          <div className={styles.progressIndeterminate} />
        ) : (
          <div className={styles.progressFill} style={{ width: `${fraction * 100}%` }} />
        )}
      </div>
      <span>{indeterminate ? 'Loading…' : `${Math.round(fraction * 100)}%`}</span>
    </div>
  );
}

export function Splash(props: SplashProps): ReactNode {
  const { blocked, canContinueAnyway, loadProgress, error, onExplore, onTour, onContinueAnyway, onReload } = props;

  const hardError = error?.kind === 'webgpu-init-failed' || error?.kind === 'catalog-fetch-failed';
  const tourDisabled = blocked || error?.kind === 'famous-meta-failed';
  const tourTooltip =
    error?.kind === 'famous-meta-failed'
      ? 'Tour is unavailable — failed to load the famous-galaxy index.'
      : undefined;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <section className={styles.card}>
        <h1 id={TITLE_ID} className={styles.title}>
          Explore millions of galaxies in 3D
        </h1>
        <p id={BODY_ID} className={styles.body}>
          A real-time 3D map of the universe, rendered in your browser. Built from real cosmic data — the{' '}
          <a href="https://www.sdss.org/" target="_blank" rel="noopener noreferrer">
            SDSS
          </a>
          ,{' '}
          <a href="https://glade.elte.hu/" target="_blank" rel="noopener noreferrer">
            GLADE
          </a>
          , and{' '}
          <a href="https://lambda.gsfc.nasa.gov/product/2mass/" target="_blank" rel="noopener noreferrer">
            2MRS
          </a>{' '}
          galaxy surveys.
        </p>

        {hardError ? (
          <div className={styles.errorBox} aria-live="polite">
            {error?.kind === 'webgpu-init-failed'
              ? 'WebGPU failed to initialize on this device. Try reloading, or use a recent version of Chrome or Edge.'
              : 'Failed to load the galaxy data. Check your connection and try reloading.'}
          </div>
        ) : (
          <ProgressRow progress={loadProgress} />
        )}

        {hardError ? (
          <div className={styles.ctas}>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaPrimary)}
              onClick={onReload}
            >
              Reload
            </button>
          </div>
        ) : (
          <div className={styles.ctas}>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaPrimary)}
              onClick={onExplore}
              disabled={blocked}
              autoFocus
            >
              Explore
            </button>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaSecondary)}
              onClick={onTour}
              disabled={tourDisabled}
              title={tourTooltip}
            >
              Tour
            </button>
          </div>
        )}

        {blocked && canContinueAnyway && !hardError ? (
          <button
            type="button"
            className={styles.continueAnyway}
            onClick={onContinueAnyway}
            aria-live="polite"
          >
            Continue anyway
          </button>
        ) : null}

        <p className={styles.footer}>
          by Alexander Rulkens &middot;{' '}
          <a href="https://github.com/rulkens/skymap" target="_blank" rel="noopener noreferrer">
            github.com/rulkens/skymap
          </a>
        </p>
      </section>
    </div>
  );
}
