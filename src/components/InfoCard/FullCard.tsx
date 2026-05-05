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
import { useState } from 'react';
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

  // Curated descriptions can run multiple paragraphs (especially for nearby
  // famous galaxies whose Wikipedia summaries are long).  Default to a 5-line
  // clamp + "show more" toggle so the card's structured-data rows stay
  // visible without scrolling.  State resets per component instance, so
  // selecting a different galaxy starts fresh in the collapsed state.
  const [descExpanded, setDescExpanded] = useState(false);

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
            aria-label={`Focus camera on ${info.iauName}`}
          >
            Focus
          </button>
        )}
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      {/*
        Famous-atlas rows show their primary curated name as the headline
        (e.g. "M31") instead of the coordinate-derived IAU designation.
        Survey rows fall back to `info.iauName` so SDSS galaxies still
        display their `SDSS J123456.78+012345.6`-style label.
      */}
      <div className={styles.cardHeadline}>{info.famous ? info.famous.names[0] : info.iauName}</div>

      {/* ── Source attribution badge ──────────────────────────────────────── */}
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>

      {/* ── Famous-atlas detail block ─────────────────────────────────────── */}
      {info.famous && (
        <div className={styles.cardSection}>
          {/*
            "Also known as" — every name beyond the headline, comma-
            separated.  Many famous galaxies have an NGC number AND a
            common name (e.g. M31 / NGC 224 / Andromeda Galaxy); listing
            all aliases makes the InfoCard recognisable to users coming
            from any naming convention.
          */}
          {info.famous.names.length > 1 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Also known as</span>
              <span className={styles.cardValue}>{info.famous.names.slice(1).join(' · ')}</span>
            </div>
          )}
          {/*
            Curated description — the most editorial part of the card.
            Wikipedia auto-extracts can run several paragraphs, so we
            line-clamp to 5 lines by default and reveal the full text when
            the user clicks "show more".  Empty descriptions render
            nothing — neither the clamp nor the toggle.
          */}
          {info.famous.description && (
            <div className={styles.cardRow}>
              <span
                className={`${styles.cardValue} ${
                  descExpanded ? styles.descExpanded : styles.descCollapsed
                }`}
                style={{ fontStyle: 'italic' }}
              >
                {info.famous.description}
              </span>
              <button
                type="button"
                className={styles.descToggle}
                onClick={() => setDescExpanded((v) => !v)}
                aria-expanded={descExpanded}
              >
                {descExpanded ? 'show less' : 'show more'}
              </button>
            </div>
          )}
          {/*
            Cross-match link — when the build-time matcher found a nearby
            survey row, surface the catalog name + offset so power users
            can see their famous click is consistent with the underlying
            data, and (eventually) jump to that row's view.  No click
            handler yet — Task 11 wires the navigation.  For now the
            label and offset alone are useful provenance.
          */}
          {info.famous.xref && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Also catalogued as</span>
              <span className={styles.cardValue}>
                {info.famous.xref.source} row #{info.famous.xref.localIdx}
                {' · '}
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {info.famous.xref.distanceArcsec.toFixed(1)}″ from curated position
                </span>
              </span>
            </div>
          )}
          {/*
            External catalog links.  The headline name (info.famous.names[0])
            is what we send to NED and Wikipedia — both resolvers accept M/NGC/
            common-name aliases, so a single URL pattern works across the whole
            atlas.  NED is the gold-standard extragalactic reference (redshift,
            distance estimates, every published photometry measurement, image
            cutouts, references — all in one page).  Wikipedia complements it
            with a non-technical writeup for users who want context rather than
            data.  We URL-encode the name to handle entries like "NGC 5128".
          */}
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Catalogues</span>
            <span className={styles.cardValue}>
              <a
                className={styles.externalInline}
                href={`https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(info.famous.names[0]!)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                NED
              </a>
              {' · '}
              {/*
                Wikipedia link uses names[1] (the NGC/IC catalogue id) when
                present, falling back to names[0] (the short Messier/Caldwell
                id) only when there is no second name.

                Why: short ids like "M51" / "C3" almost always resolve to a
                Wikipedia *disambiguation* page — "M51" lists motorways,
                rifles, and chess openings before mentioning the galaxy, and
                "M109" redirects outright to the M109 howitzer.  The NGC/IC
                slug ("NGC_5194", "IC_342") reliably hits the actual galaxy
                article.  We URL-encode and replace spaces with underscores
                the same way Wikipedia's title canonicalisation does.
              */}
              <a
                className={styles.externalInline}
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent((info.famous.names[1] ?? info.famous.names[0]!).replace(/ /g, '_'))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Wikipedia
              </a>
            </span>
          </div>
        </div>
      )}

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
        {/*
          The g-slot label is source-aware: SDSS reports actual g-band, but
          2MRS puts J in this slot and GLADE puts B in this slot.  Showing the
          real band name (info.bands.g) keeps the row honest for non-SDSS
          galaxies where "(g)" would have been a quiet lie.
        */}
        <CardRow
          label={`Apparent mag (${info.bands.g})`}
          value={Number.isNaN(info.magG) ? 'N/A' : info.magG.toFixed(2)}
        />
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
          {/*
            Same source-aware band label as the apparent-mag row above: the
            absolute magnitude is computed from whichever band sits in the
            g-slot, so the label has to follow.
          */}
          <CardRow
            label={`Absolute mag (${info.bands.g})`}
            value={Number.isNaN(info.absoluteMagG) ? 'N/A' : info.absoluteMagG.toFixed(2)}
          />
          {/*
            Colour row uses the pre-computed `info.colours` array instead of
            hardcoding u−g/g−r/r−i. This is the only place the Card cares
            about which bands a survey actually carries — pointInfoBuilder
            decides which adjacent-slot pairs to include based on which
            bands are present, so SDSS gets three colours, 2MRS two, GLADE
            three (B−J/J−H/H−K), Synthetic three.  If a row has no usable
            colours (all NaN), we hide the row entirely rather than render
            an empty value.
          */}
          {info.colours.length > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Colour</span>
              <span className={styles.cardValue}>
                {info.colours.map((c, idx) => (
                  <span key={c.label}>
                    {idx > 0 && <>&nbsp;&nbsp;</>}
                    {c.label}&nbsp;{c.value.toFixed(2)}
                  </span>
                ))}
              </span>
            </div>
          )}
          {/*
            Orientation row — shows the per-galaxy ellipse shape (b/a) and
            position angle (PA) plus a small-font provenance tag underneath
            so the user can tell at a glance whether THIS galaxy's billboard
            orientation came from a real survey measurement or from the
            deterministic fallback PRNG.

            We render inside <details> because most users don't need to see
            it, but those who care about validating cross-match coverage
            (e.g. after running `npm run fetch-2mass-xsc`) can pop it open.
          */}
          <CardRow
            label="Orientation"
            value={
              <>
                b/a&nbsp;{info.orientation.axisRatio.toFixed(2)}
                &nbsp;&nbsp;PA&nbsp;{info.orientation.positionAngleDeg.toFixed(0)}&deg;
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                  {info.orientation.provenance}
                </span>
              </>
            }
          />
          {/*
            Diameter row — shows the per-galaxy physical size driving the
            renderer's apparent-size, focus-tween, and quad-size code. The
            small-font provenance tag distinguishes "we measured this"
            (catalog isophotal/Petrosian radius) from "we estimated it"
            (Tully size–luminosity from B-mag) from "no real signal"
            (project-wide 30 kpc default).  Helps explain why two galaxies
            of similar magnitude render at very different on-screen sizes.
          */}
          <CardRow
            label="Diameter"
            value={
              <>
                {info.diameterKpc.toFixed(1)}&nbsp;kpc
                <br />
                <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{info.diameterProvenance}</span>
              </>
            }
          />
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
