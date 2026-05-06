/**
 * LoadingBar — thin glowing progress strip pinned to the top of the viewport.
 *
 * ### What it does
 *
 * Renders a 2 px-tall horizontal bar across the very top of the page that
 * shows network-level download progress for the data tier the engine is
 * loading.  Two visual modes:
 *
 *   - **Determinate** — when the aggregator has a known `totalBytes` (the
 *     sum of all in-flight `Content-Length` headers), the fill grows
 *     left-to-right as bytes arrive.  Smooth `width` transition keeps the
 *     bar from staircasing on per-chunk events.
 *   - **Indeterminate** — when at least one source's `total` is `0`
 *     (server didn't send `Content-Length` — chunked transfer, gzipped
 *     proxies), a 30 %-wide gradient blob slides back and forth across
 *     the track.  Communicates "something's happening" without lying
 *     about the fraction complete.
 *
 * ### Why a top-of-viewport strip
 *
 * The bar must remain visible regardless of which overlay is open —
 * Settings panel, InfoCard, CommandPalette modal — so a fixed-position,
 * z-index 100 strip at the top edge wins over (a) a row inside the
 * StatsPanel (hidden when the panel is collapsed) and (b) an in-canvas
 * overlay (visually crowds the renderer).  GitHub, YouTube, and many
 * web apps use the same pattern; the affordance is well-learned.
 *
 * ### Why a fade-out rather than instant unmount
 *
 * `progress === null` means "no fetches in flight".  Hiding the bar
 * instantly produces a visual flash if the load completes in <100 ms
 * (small tier on a fast connection); a 200 ms opacity fade gives the
 * eye time to track the bar to full and then smoothly retreat.  The
 * tween is CSS-only — no React state for the fade — so the unmount
 * happens after the parent re-renders with `progress === null` and
 * the CSS transition handles the visual.
 *
 * Actually, since the parent (App.tsx) sets `progress = null` and
 * we want the fade to play before unmount, the cleanest pattern is:
 * keep the bar mounted whenever progress was ever non-null, and
 * track an internal "visible" boolean that lags behind by 200 ms.
 * Implemented below via a useEffect that schedules an unmount.
 */

import { useEffect, useState, type ReactNode } from 'react';
import cx from 'classnames';
import type { LoadProgressState } from '../../@types/EngineCallbacks';
import styles from './LoadingBar.module.css';

/** Props for LoadingBar.  Matches the engine's `onLoadProgress` shape. */
export type LoadingBarProps = {
  /**
   * Aggregated download-progress snapshot from the engine's aggregator.
   * `null` when no fetches are in flight — triggers the fade-out.
   */
  progress: LoadProgressState | null;
};

export function LoadingBar({ progress }: LoadingBarProps): ReactNode {
  // Internal "visible" state lags behind `progress === null` by the CSS
  // fade-out duration so the opacity transition has time to play.  Without
  // this lag, removing the element from the DOM the moment progress becomes
  // null would cancel the transition mid-way and the bar would just blink
  // off.
  const [visible, setVisible] = useState<boolean>(progress !== null);

  useEffect(() => {
    if (progress !== null) {
      // New load started or progress updated — show the bar immediately.
      setVisible(true);
      return;
    }
    // Load finished — schedule the unmount after the CSS fade duration.
    // 220 ms = the CSS `--duration-base` (200 ms) plus a 20 ms safety
    // margin so the transition definitely completes before unmount.
    const timeout = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timeout);
  }, [progress]);

  if (!visible) return null;

  // Indeterminate when the aggregator hasn't seen any non-zero totals
  // yet — typically the brief window between `start` (which fires with
  // total=0 if Content-Length is missing) and the first chunk arriving
  // with a known size.  Also covers the case where the server simply
  // never reports a total.
  const indeterminate = !progress || progress.totalBytes === 0;

  // Fraction of bytes received.  Clamped at 1 so the bar can't visually
  // overshoot — a misbehaving server sending more bytes than its
  // advertised Content-Length would otherwise wedge the fill past 100 %.
  const fraction =
    progress && progress.totalBytes > 0
      ? Math.min(1, progress.loadedBytes / progress.totalBytes)
      : 0;

  return (
    <div
      className={cx(styles.track, progress === null && styles.trackHidden)}
      role="progressbar"
      aria-label="Loading galaxy data"
      // Screen readers get the determinate fraction when known; absent
      // for indeterminate (per ARIA, omitting aria-valuenow on a
      // progressbar is the indeterminate signal).
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(fraction * 100)}
    >
      {indeterminate ? (
        <div className={cx(styles.fill, styles.indeterminate)} />
      ) : (
        <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
      )}
    </div>
  );
}
