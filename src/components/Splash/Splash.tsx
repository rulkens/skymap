// src/components/Splash/Splash.tsx
/**
 * Splash — first-paint onboarding overlay, film-title style.
 *
 * Transparent typographic overlay pinned to the viewport's bottom-left
 * with a localized vignette protecting legibility. No card, no glass,
 * no centred dialog — the galaxy field behind is the hero, the splash
 * frames it. Centre stays clear so the Milky Way + "You are here"
 * marker remain visible.
 *
 * Presentational. All state lives in `useSplash`; this component takes
 * rendered state + handlers as props.
 *
 * A11y: role="dialog", aria-modal, focus trap, Esc dismiss.
 *
 * Failure modes — all three render the same error box + Reload (no CTAs),
 * copy keyed by `SplashError['kind']` via ERROR_COPY below:
 *   - webgpu-init-failed
 *   - catalog-fetch-failed
 *   - data-version-mismatch
 *
 * The synchronous "no navigator.gpu" path is handled in main.tsx
 * before React mounts; the splash never sees it.
 */

import { Fragment, type MouseEvent, type ReactNode, useEffect, useRef } from 'react';
import cx from 'classnames';
import SplashProgress from './SplashProgress';
import {
  BODY_DATA_ID,
  BODY_ID,
  CREDIT_GROUPS,
  DESCRIBED_BY,
  ERROR_COPY,
  TITLE_ID,
} from './Splash.constants';
import type { SplashError } from '../../@types/splash/SplashError';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './Splash.module.css';

export type SplashProps = {
  readonly blocked: boolean;
  readonly canContinueAnyway: boolean;
  readonly loadProgress?: LoadProgressState | null;
  readonly error: SplashError | null;
  readonly onExplore: () => void;
  readonly onTour: () => void;
  readonly onContinueAnyway: () => void;
  readonly onReload: () => void;
};

function Splash({
  blocked,
  canContinueAnyway,
  loadProgress,
  error,
  onExplore,
  onTour,
  onContinueAnyway,
  onReload,
}: SplashProps): ReactNode {
  const hardError = error !== null;

  // Focus trap: move focus inside on mount, cycle on Tab boundaries,
  // dismiss on Esc. Smaller than pulling in focus-trap-react for ≤5
  // focusables. Initial focus targets [data-splash-primary] so Explore
  // (or Reload, in the error branch) is the landing element.
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;

    const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const initial =
      root.querySelector<HTMLElement>('[data-splash-primary]:not([disabled])') ??
      focusables()[0] ??
      null;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExplore();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onExplore]);

  // Click-outside dismiss — backdrop clicks fire onExplore, matching
  // Esc behaviour. The vignette has pointer-events:none so its clicks
  // bubble through to .root and pass the target===currentTarget test;
  // clicks on the .column or its descendants do not.
  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onExplore();
  };

  return (
    <div
      ref={dialogRef}
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-describedby={DESCRIBED_BY}
      onClick={onBackdropClick}
    >
      <div className={styles.vignette} aria-hidden="true" />

      <section className={styles.column}>
        <div className={styles.label}>SKYMAP</div>
        <h1 id={TITLE_ID} className={styles.title}>
          Welcome
          <br />
          to the universe
        </h1>
        <p id={BODY_ID} className={styles.body}>
          Hey traveler 👋 <br />
          Have you ever wondered what the universe looks like in 3D? Skymap gives you the chance to
          explore Earth, the Solar System, the Milky Way, other galaxies and much more!
        </p>
        <p id={BODY_DATA_ID} className={styles.body}>
          Everything you see here is based on real astronomical data, and the code is fully open
          source (MIT).
        </p>

        {error ? (
          <div className={styles.errorBox} aria-live="polite">
            {ERROR_COPY[error.kind]}
          </div>
        ) : null}

        {hardError ? (
          <div className={styles.ctas}>
            <button type="button" className={styles.cta} onClick={onReload} data-splash-primary>
              Reload
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </button>
          </div>
        ) : (
          <div className={styles.ctas}>
            <button
              type="button"
              className={styles.cta}
              onClick={onExplore}
              disabled={blocked}
              data-splash-primary
            >
              Explore
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </button>
            <button type="button" className={styles.cta} onClick={onTour} disabled={blocked}>
              Tour
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </button>
          </div>
        )}

        {blocked && canContinueAnyway && !hardError ? (
          <button
            type="button"
            className={cx(styles.cta, styles.continueAnyway)}
            onClick={onContinueAnyway}
            aria-live="polite"
          >
            Continue anyway
          </button>
        ) : null}

        <div className={styles.footer}>
          <p className={styles.credits}>
            Skymap aims to accurately represent data from{' '}
            {CREDIT_GROUPS.map(({ label, sources }, gi) => (
              <Fragment key={label}>
                {gi > 0 ? ', ' : ''}
                {label} (
                {sources.map(({ name, url }, si) => (
                  <Fragment key={url}>
                    {si > 0 ? ', ' : ''}
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {name}
                    </a>
                  </Fragment>
                ))}
                )
              </Fragment>
            ))}
            , and more.
          </p>
          <p className={styles.attribution}>
            &copy; 2026 by{' '}
            <a href="https://rulkens.com/about" target="_blank" rel="noopener noreferrer">
              Alexander Rulkens
            </a>
            <br />
            Code at{' '}
            <a href="https://github.com/rulkens/skymap" target="_blank" rel="noopener noreferrer">
              github.com/rulkens/skymap
            </a>
          </p>
        </div>
      </section>

      {!hardError ? <SplashProgress progress={loadProgress} /> : null}
    </div>
  );
}

export default Splash;
