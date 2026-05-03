/**
 * FullCard — the rich galaxy info layout with thumbnail, cosmology summary,
 * coordinate rows, expandable details, and an SDSS Explorer link.
 *
 * This is the primary display component for a selected or hovered galaxy.
 * It is used in two contexts by InfoCard:
 *   - Standalone (single point active): fixed to the top-right corner via CSS.
 *   - Inside an info-card-stack: positioned relative by the stack's flex layout.
 *
 * The `pinned` prop controls whether the PINNED badge is visible.  It is shown
 * when the selected point is being displayed without an active hover (i.e. the
 * cursor has moved off canvas but a selection remains).
 *
 * All layout comes from FullCard.module.css; the class names map to the former
 * global CSS classes declared in index.html.
 *
 * ### Why `<details>` for the expandable section?
 *
 * Native `<details>` / `<summary>` has built-in keyboard accessibility
 * (Space/Enter toggles), correct ARIA semantics, and zero JavaScript state.
 * A custom expand component would need to replicate all of that manually.
 */

import type { ReactNode } from 'react';
import type { PointInfo } from '../../@types';
import { formatDistance } from '../../utils/format/distance';
import { Thumbnail } from './Thumbnail';
import styles from './FullCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props for FullCard. */
export type FullCardProps = {
  info: PointInfo;
  /** When true, show the PINNED badge and apply the pinned styling variant. */
  pinned?: boolean;
  /**
   * Optional callback fired when the user clicks the Focus button.
   *
   * Only rendered when `pinned` is true — the button only makes sense for the
   * persistent (selected) galaxy, not for the transient hover preview.  When
   * omitted, the button is not rendered.
   */
  onFocus?: (info: PointInfo) => void;
};

// ── CardRow ────────────────────────────────────────────────────────────────────

/** Props for a single label/value row. */
type CardRowProps = {
  /** The field label (left side). */
  label: string;
  /** The field value — plain string or JSX with inline elements (°, units, etc.). */
  value: ReactNode;
};

/**
 * A single label/value row inside the info card.
 *
 * Extracted to avoid repeating the `.card-row` / `.card-label` / `.card-value`
 * class names throughout FullCard.  Internal to this file — not exported.
 */
function CardRow({ label, value }: CardRowProps): ReactNode {
  return (
    <div className={styles.cardRow}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
    </div>
  );
}

// ── FullCard ───────────────────────────────────────────────────────────────────

/**
 * The full rich layout: SDSS name headline, thumbnail, cosmology summary,
 * coordinate rows, expandable details, and a "View in SDSS Explorer" link.
 *
 * Corresponds to the agreed wireframe:
 *
 *   OBJECT                        PINNED
 *   SDSS J123456.78+012345.6
 *   [img]  Light left 1.3 Gyr ago
 *          — during Earth's Mesoproterozoic
 *          542 Mpc · 30,000 km/s away
 *          Red, quiescent galaxy
 *   RA   12h34m56.78s  /  188.7365°
 *   Dec  +01°23'45.6"  /  +1.3960°
 *   Redshift z          0.1234
 *   Apparent mag (g)    18.50
 *   ▾ More details
 *     Absolute mag (g)  −20.45
 *     Color  u−g 0.70  g−r 0.95  r−i 0.41
 *     ObjID  1237651738291...
 *   View in SDSS Explorer →
 */
export function FullCard({ info, pinned = false, onFocus }: FullCardProps): ReactNode {
  // Compose the outer class: always infoCardFull, plus pinned variant when needed.
  // CSS modules scope both classes so we just combine them with a space.
  const outerClass = pinned ? `${styles.infoCardFull} ${styles.pinned}` : styles.infoCardFull;

  return (
    <div className={outerClass} role="status" aria-live="polite">
      {/* ── Title row ─────────────────────────────────────────────────────── */}
      <div className={styles.cardTitle}>
        <span>Object</span>
        {/* The PINNED badge is always in the DOM; CSS shows/hides via .pinned */}
        <span className={styles.pinnedBadge}>Pinned</span>
        {/*
          Focus button — only rendered when the card is pinned AND a callback
          was supplied.  We pass the full PointInfo so the parent can pull the
          world coordinates (for the camera tween) without re-doing the lookup.
        */}
        {pinned && onFocus && (
          <button
            type="button"
            className={styles.focusButton}
            onClick={() => onFocus(info)}
            aria-label={`Focus camera on ${info.sdssName}`}
          >
            Focus
          </button>
        )}
      </div>

      {/* ── SDSS designation ──────────────────────────────────────────────── */}
      <div className={styles.cardHeadline}>{info.sdssName}</div>

      {/* ── Source attribution badge ──────────────────────────────────────── */}
      {/*
        Tiny uppercase badge tagging which survey this row came from (SDSS,
        2MRS, GLADE, Synthetic).  Sits just below the SDSS-style headline
        because the headline name is a coordinate-derived convention used
        across surveys, not a guarantee of SDSS provenance — the badge is
        what tells the user where the actual measurements came from.
      */}
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>

      {/* ── Thumbnail + cosmology summary ─────────────────────────────────── */}
      <div className={`${styles.cardSection} ${styles.cardTopRow}`}>
        <Thumbnail ra={info.ra} dec={info.dec} url={info.thumbnailUrl} />
        <div className={styles.cardSummary}>
          {/* Friendly lookback line — the most memorable single fact about this galaxy. */}
          <div className={styles.cardLookbackLine}>
            Light left {info.lookbackGyr.toFixed(1)} Gyr ago
          </div>
          <div className={styles.cardLookbackEra}>— {info.earthEra}</div>
          <div className={styles.cardDistLine}>
            {formatDistance(info.distanceMpc)} &middot;{' '}
            {Math.round(info.hubbleVelocityKmS).toLocaleString()} km/s away
          </div>
          <div className={styles.cardTypeLine}>{info.galaxyType.description}</div>
        </div>
      </div>

      {/* ── Coordinate rows ───────────────────────────────────────────────── */}
      <div className={styles.cardSection}>
        <CardRow
          label="RA"
          value={
            <>
              {info.raSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.ra.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow
          label="Dec"
          value={
            <>
              {info.decSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.dec.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow label="Redshift z" value={info.redshift.toFixed(4)} />
        <CardRow label="Apparent mag (g)" value={info.magG.toFixed(2)} />
      </div>

      {/* ── Expandable detail section ──────────────────────────────────────── */}
      {/*
        We use the native <details> element for the expand/collapse behaviour.
        Reasons:
          1. Built-in keyboard accessibility: Space and Enter toggle it without
             any extra JavaScript.
          2. Correct ARIA semantics out of the box (role="group" + disclosure button).
          3. Zero JS state — the browser owns the open/closed state; no useState needed.
          4. Persists across re-renders: React reconciles <details> in place and
             preserves the `open` DOM attribute unless we change the `open` prop,
             which we never do (we only set `open` at mount if we wanted it pre-open,
             which we don't).
        Default: closed — secondary fields clutter the first glance.
      */}
      <details>
        <summary className={styles.detailsSummary}>More details</summary>

        <div className={styles.cardSection}>
          <CardRow
            label="Absolute mag (g)"
            value={Number.isNaN(info.absoluteMagG) ? 'N/A' : info.absoluteMagG.toFixed(2)}
          />
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Colour</span>
            <span className={styles.cardValue}>
              u&minus;g&nbsp;{(info.magU - info.magG).toFixed(2)}&nbsp;&nbsp; g&minus;r&nbsp;
              {(info.magG - info.magR).toFixed(2)}&nbsp;&nbsp; r&minus;i&nbsp;
              {(info.magR - info.magI).toFixed(2)}
            </span>
          </div>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>ObjID</span>
            {/*
              The raw SDSS objID is a 19-digit number. We render it in a <code>
              element with tabular-nums so the digits don't reflow, and at a
              slightly smaller font size so it fits on one line inside the card.
            */}
            <code className={`${styles.cardValue} ${styles.cardObjid}`}>{String(info.objID)}</code>
          </div>
        </div>
      </details>

      {/* ── External link ─────────────────────────────────────────────────── */}
      {/*
        `rel="noopener"` prevents the opened tab from accessing this window via
        `window.opener` — a standard security practice for any `target="_blank"`
        link.  Without it a malicious (or compromised) page could navigate the
        opener to a phishing URL.  `noreferrer` would also suppress the Referer
        header, but that's not needed here since skyserver.sdss.org is a trusted
        public resource.

        Only SDSS-sourced galaxies have a useful Explorer page; for 2MRS/GLADE
        rows we render a disabled-looking note instead of a link that would
        404 against an unrelated SDSS objID.
      */}
      {info.explorerUrl ? (
        <a className={styles.externalLink} href={info.explorerUrl} target="_blank" rel="noopener">
          View in SDSS Explorer &rarr;
        </a>
      ) : (
        <div className={`${styles.externalLink} ${styles.externalLinkDisabled}`}>
          No catalogue page for {info.sourceLabel}
        </div>
      )}
    </div>
  );
}
