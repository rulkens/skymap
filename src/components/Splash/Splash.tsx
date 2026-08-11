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

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import cx from 'classnames';
import SplashProgress from './SplashProgress';
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

const TITLE_ID = 'splash-title';
const BODY_ID = 'splash-body';

// Copy keyed by SplashError['kind'] — the project's >2-way rule: a Record
// scales to a new error kind by adding a row, not another ternary branch.
const ERROR_COPY: Record<SplashError['kind'], string> = {
  'webgpu-init-failed':
    'WebGPU failed to initialize on this device. Try reloading, or use a recent version of Chrome or Edge.',
  'catalog-fetch-failed':
    'Failed to load the galaxy data. Check your connection and try reloading.',
  'data-version-mismatch': 'Skymap was updated — reload the page to fetch matching data',
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
      aria-describedby={BODY_ID}
      onClick={onBackdropClick}
    >
      <div className={styles.vignette} aria-hidden="true" />

      <section className={styles.column}>
        <div className={styles.label}>SKYMAP · INTRO</div>
        <h1 id={TITLE_ID} className={styles.title}>
          Have a look at
          <br />
          the neighbours
        </h1>
        <p id={BODY_ID} className={styles.body}>
          About 2.5 million of them, give or take, mapped from four catalogues that took decades to
          put together. The cosmic web runs through the middle; quasars sit much further out, well
          past the galaxies. The bright glow near the centre is home (our Milky Way).
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
            Drawn from the{' '}
            <a href="https://www.sdss.org/" target="_blank" rel="noopener noreferrer">
              SDSS
            </a>
            ,{' '}
            <a href="https://glade.elte.hu/" target="_blank" rel="noopener noreferrer">
              GLADE
            </a>
            ,{' '}
            <a
              href="https://lambda.gsfc.nasa.gov/product/2mass/"
              target="_blank"
              rel="noopener noreferrer"
            >
              2MRS
            </a>
            ,{' '}
            <a
              href="https://heasarc.gsfc.nasa.gov/W3Browse/all/milliquas.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Milliquas
            </a>{' '}
            and{' '}
            <a href="https://data.desi.lbl.gov/" target="_blank" rel="noopener noreferrer">
              DESI DR1
            </a>{' '}
            (CC&nbsp;BY&nbsp;4.0) catalogues. Planet, moon and ring textures from{' '}
            <a href="https://www.solarsystemscope.com/" target="_blank" rel="noopener noreferrer">
              Solar System Scope
            </a>{' '}
            (solarsystemscope.com), CC&nbsp;BY&nbsp;4.0, with Earth from NASA Earth Observatory
            (Blue Marble) and the Galilean moons from NASA/USGS.
          </p>
          <p className={styles.attribution}>
            by Alexander Rulkens
            <br />
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
