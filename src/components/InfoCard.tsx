/**
 * InfoCard — the glassmorphism overlay that shows galaxy data on hover/select.
 *
 * ### Display logic
 *
 * The card is absent from the DOM entirely when both `hovered` and `selected`
 * are null.  When one or both are present:
 *
 *   - Only one point active → a single FullCard (with a PINNED badge if it is
 *     the selected point and the cursor has moved away).
 *   - Both hovered AND selected pointing at *different* points → two cards
 *     stacked vertically: the full pinned card on top, a compact hover card
 *     below.  This lets the user keep a reference point pinned while scanning
 *     other galaxies.
 *
 * ### Architecture
 *
 * Three components live in this file:
 *
 *   InfoCard      — public; the routing/logic layer described above.
 *   FullCard      — the rich layout with thumbnail, expandable details, link.
 *   CompactCard   — a slimmer variant shown for the secondary (hover) point
 *                   when both cards are visible simultaneously.
 *
 * All three are pure functions of their props — no local state is needed
 * because the engine drives all changes via callbacks up to App.tsx.
 *
 * ### CSS
 *
 * Uses `.info-card-full`, `.info-card-compact`, `.info-card-stack`, and the
 * `.card-*` utility classes declared in `index.html`.  The `data-pinned`
 * attribute on a `.info-card-full` element drives the PINNED badge via:
 *
 *   .info-card-full[data-pinned] #pinned-badge { display: inline; }
 *
 * ### Why `<details>` for the expandable section?
 *
 * Native `<details>` / `<summary>` has built-in keyboard accessibility
 * (Space/Enter toggles), correct ARIA semantics (`role="group"` + disclosure
 * triangle), and zero JavaScript state.  A custom expand component would need
 * to replicate all of that manually.  We default to closed (`open` attribute
 * omitted) because the secondary fields (absolute magnitude, all five colour
 * differences, raw objID) clutter the first glance.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { PointInfo } from '../engine';

// ── Public component ──────────────────────────────────────────────────────────

/**
 * Props for the InfoCard.
 *
 * Both fields are nullable: when neither is set the component renders nothing.
 */
type Props = {
  /** The point currently under the cursor, or null when the cursor is on empty sky. */
  hovered: PointInfo | null;
  /** The pinned/selected point, or null when nothing is pinned. */
  selected: PointInfo | null;
};

/**
 * Galaxy info card rendered as a fixed top-right overlay.
 *
 * Returns `null` (nothing in the DOM) when both props are null — keeps the
 * accessibility tree clean and avoids an empty glass-panel flashing at startup.
 *
 * @example
 * // In App.tsx:
 * <InfoCard hovered={hovered} selected={selected} />
 */
export function InfoCard({ hovered, selected }: Props): ReactNode {
  // Nothing to show — stay entirely out of the DOM.
  if (!hovered && !selected) return null;

  // When BOTH hovered and selected are set AND they point to different points,
  // render a stacked pair: full pinned card on top, compact hover card below.
  if (hovered && selected && hovered.index !== selected.index) {
    return (
      <div className="info-card-stack">
        <FullCard info={selected} pinned={true} />
        <CompactCard info={hovered} />
      </div>
    );
  }

  // Single-card case: hovered takes precedence (live preview); fall back to
  // selected when the cursor has moved off canvas.
  const info = hovered ?? selected!;
  const pinned = !hovered; // only show PINNED badge when falling back to selection
  return <FullCard info={info} pinned={pinned} />;
}

// ── FullCard ──────────────────────────────────────────────────────────────────

/** Props for FullCard and CompactCard. */
type CardProps = {
  info: PointInfo;
  pinned?: boolean;
};

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
function FullCard({ info, pinned = false }: CardProps): ReactNode {
  return (
    <div
      className="info-card-full"
      role="status"
      aria-live="polite"
      // data-pinned is present (empty string) when pinned, absent when not.
      // The CSS rule `.info-card-full[data-pinned] #pinned-badge` makes the badge visible.
      // React treats `undefined` attribute values as "omit this attribute" — no
      // empty-string-vs-null ambiguity here.
      data-pinned={pinned ? '' : undefined}
    >
      {/* ── Title row ───────────────────────────────────────────────────────── */}
      <div className="card-title">
        <span>Object</span>
        {/* The PINNED badge is always in the DOM; the CSS data-pinned rule shows/hides it. */}
        <span id="pinned-badge">Pinned</span>
      </div>

      {/* ── SDSS designation ────────────────────────────────────────────────── */}
      <div className="card-headline">{info.sdssName}</div>

      {/* ── Thumbnail + cosmology summary ───────────────────────────────────── */}
      <div className="card-section card-top-row">
        <Thumbnail ra={info.ra} dec={info.dec} url={info.thumbnailUrl} />
        <div className="card-summary">
          {/* Friendly lookback line — the most memorable single fact about this galaxy. */}
          <div className="card-lookback-line">
            Light left {info.lookbackGyr.toFixed(1)} Gyr ago
          </div>
          <div className="card-lookback-era">— {info.earthEra}</div>
          <div className="card-dist-line">
            {formatMpc(info.distanceMpc)} &middot;{' '}
            {Math.round(info.hubbleVelocityKmS).toLocaleString()} km/s away
          </div>
          <div className="card-type-line">{info.galaxyType.description}</div>
        </div>
      </div>

      {/* ── Coordinate rows ─────────────────────────────────────────────────── */}
      <div className="card-section">
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
        <CardRow label="Redshift z"       value={info.redshift.toFixed(4)} />
        <CardRow label="Apparent mag (g)" value={info.magG.toFixed(2)} />
      </div>

      {/* ── Expandable detail section ────────────────────────────────────────── */}
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
        <summary className="details-summary">More details</summary>

        <div className="card-section">
          <CardRow
            label="Absolute mag (g)"
            value={
              Number.isNaN(info.absoluteMagG)
                ? 'N/A'
                : info.absoluteMagG.toFixed(2)
            }
          />
          <div className="card-row">
            <span className="card-label">Colour</span>
            <span className="card-value">
              u&minus;g&nbsp;{(info.magU - info.magG).toFixed(2)}&nbsp;&nbsp;
              g&minus;r&nbsp;{(info.magG - info.magR).toFixed(2)}&nbsp;&nbsp;
              r&minus;i&nbsp;{(info.magR - info.magI).toFixed(2)}
            </span>
          </div>
          <div className="card-row">
            <span className="card-label">ObjID</span>
            {/*
              The raw SDSS objID is a 19-digit number. We render it in a <code>
              element with tabular-nums so the digits don't reflow, and at a
              slightly smaller font size so it fits on one line inside the card.
            */}
            <code className="card-value card-objid">{String(info.objID)}</code>
          </div>
        </div>
      </details>

      {/* ── External link ───────────────────────────────────────────────────── */}
      {/*
        `rel="noopener"` prevents the opened tab from accessing this window via
        `window.opener` — a standard security practice for any `target="_blank"`
        link.  Without it a malicious (or compromised) page could navigate the
        opener to a phishing URL.  `noreferrer` would also suppress the Referer
        header, but that's not needed here since skyserver.sdss.org is a trusted
        public resource.
      */}
      <a
        className="external-link"
        href={info.explorerUrl}
        target="_blank"
        rel="noopener"
      >
        View in SDSS Explorer &rarr;
      </a>
    </div>
  );
}

// ── CompactCard ───────────────────────────────────────────────────────────────

/**
 * A slimmer info card shown below the pinned FullCard when the user hovers
 * over a second point while a selection is active.
 *
 * Contains only: SDSS name, lookback / era, galaxy type, and distance.
 * No thumbnail, no expandable section, no external link — visual weight is
 * deliberately lower than the FullCard above it.
 */
function CompactCard({ info }: CardProps): ReactNode {
  return (
    <div className="info-card-compact" role="status" aria-live="polite">
      <div className="card-title">
        <span>Hover</span>
      </div>
      <div className="card-headline">{info.sdssName}</div>
      <div className="card-lookback-line">
        Light left {info.lookbackGyr.toFixed(1)} Gyr ago
      </div>
      <div className="card-lookback-era">— {info.earthEra}</div>
      <div className="card-dist-line">
        {formatMpc(info.distanceMpc)} &middot; {info.galaxyType.description}
      </div>
    </div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

/** Props for the Thumbnail sub-component. */
type ThumbnailProps = {
  ra: number;
  dec: number;
  url: string;
};

/**
 * 80×80 px SDSS image cutout with a broken-image fallback.
 *
 * We use `loading="lazy"` so the browser fetches the JPEG only when the card
 * is actually in the viewport — prevents wasted bandwidth on points that are
 * hovered only briefly.  We do NOT pre-fetch: the URL is built lazily each
 * time `buildPointInfo` runs, and the browser's HTTP cache handles repeat
 * hovers over the same point for free.
 *
 * On error (network failure, coord outside SDSS footprint, etc.) we hide the
 * image and show a `.thumb-placeholder` div with the same 80×80 dimensions so
 * the surrounding layout doesn't reflow.
 */
function Thumbnail({ url }: ThumbnailProps): ReactNode {
  // Single boolean: has the image failed to load?
  // We keep this local state here rather than lifting it to FullCard because
  // the fallback is purely a presentation concern — nothing else needs to know.
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="thumb-placeholder" aria-label="No image available">
        no image
      </div>
    );
  }

  return (
    <img
      className="thumb-img"
      src={url}
      alt="SDSS cutout"
      width={80}
      height={80}
      loading="lazy"
      // On any load failure (404, CORS, network) flip `errored` so we swap to
      // the placeholder.  This prevents a broken-image icon from appearing.
      onError={() => setErrored(true)}
    />
  );
}

// ── CardRow ───────────────────────────────────────────────────────────────────

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
 * Extracted as its own component to avoid repeating the `.card-row` /
 * `.card-label` / `.card-value` class names throughout `FullCard`.
 */
function CardRow({ label, value }: CardRowProps): ReactNode {
  return (
    <div className="card-row">
      <span className="card-label">{label}</span>
      <span className="card-value">{value}</span>
    </div>
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format a distance in Mpc, switching units for readability:
 *   < 1 Mpc    → kpc  (e.g. "430 kpc")
 *   < 1000 Mpc → Mpc  (e.g. "542 Mpc")  — most SDSS galaxies
 *   ≥ 1000 Mpc → Gpc  (e.g. "2.1 Gpc")
 *
 * toLocaleString adds thousands separators for large values (e.g. "2,100 Mpc").
 */
function formatMpc(mpc: number): string {
  if (mpc < 1)    return `${Math.round(mpc * 1000).toLocaleString()} kpc`;
  if (mpc < 1000) return `${Math.round(mpc).toLocaleString()} Mpc`;
  return `${(mpc / 1000).toFixed(1)} Gpc`;
}
