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
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { Source } from '../../data/sources';
import { formatDistance, formatDiameterKpc } from '../../utils/format/distance';
import { Thumbnail } from './Thumbnail';
import { InfoTip } from '../InfoTip/InfoTip';
import { TIPS } from './tooltips';
import styles from './FullCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Discriminated mode prop for FullCard.
 *
 * The card has two display variants: the rich galaxy layout (driven by a
 * `GalaxyInfo` from the picker / palette / deep-link) and a compact
 * point-of-interest layout (cluster / supercluster / void anchors —
 * structures with a name, a category, a distance, and a physical radius
 * but no per-galaxy photometry).
 *
 * A discriminated union keeps each branch's prop shape narrow: the galaxy
 * branch never has to worry about a missing `info`, and the POI branch
 * never has to worry about photometry that doesn't exist for a structure
 * the size of Virgo.  The chrome (outer wrapper, title row, source badge
 * placement) is shared at the JSX level inside the component, so the
 * outer-wrapper identity stays stable across the galaxy↔POI transition —
 * critical for the `<details>` open-state preservation rule documented
 * in InfoCard.tsx.
 *
 * Why not a separate `PoiCard.tsx`?  The chrome (outer wrapper, title row
 * with PINNED badge + close button affordance) is non-trivial and easy to
 * drift if duplicated.  The body branches are small enough (POI body is
 * three rows + a "Fly here" button) that branching inside FullCard wins.
 */
export type FullCardMode =
  | { readonly kind: 'galaxy'; readonly info: GalaxyInfo }
  | { readonly kind: 'poi'; readonly poi: PointOfInterest };

/**
 * Props for FullCard.
 *
 * The component accepts either:
 *   - `mode` — the explicit discriminated form ({kind: 'galaxy' | 'poi'}).
 *   - `info` — legacy shorthand equivalent to `{kind: 'galaxy', info}`.
 *
 * `mode` takes priority when both are present.  The two shapes coexist so
 * existing call sites that pass `info` directly (InfoCard's galaxy branch)
 * stay terse — they don't need to wrap every render in a discriminator
 * object literal.
 */
export type FullCardProps = {
  /**
   * The discriminated display mode.  When provided, takes priority over
   * the legacy `info` shorthand.  Omitted callers must pass `info`.
   */
  mode?: FullCardMode;
  /**
   * Galaxy-mode shorthand: equivalent to `mode={{kind: 'galaxy', info}}`.
   * Ignored when `mode` is also provided.  Kept for the common galaxy
   * call site in InfoCard so the JSX stays one prop instead of two.
   */
  info?: GalaxyInfo;
  /** When true, show the PINNED badge and apply the pinned styling variant. */
  pinned?: boolean;
  /**
   * Optional callback fired when the user clicks the Focus button.
   *
   * Only rendered when `pinned` is true — the button only makes sense for the
   * persistent (selected) galaxy, not for the transient hover preview.  When
   * omitted, the button is not rendered.  Ignored in POI mode (the POI body
   * uses `onPoiFocus` instead so the parent gets a typed `PointOfInterest`).
   */
  onFocus?: (info: GalaxyInfo) => void;
  /**
   * Optional callback fired when the user clicks the "Fly here" button in
   * the POI body.  The parent receives the full `PointOfInterest` so it can
   * call `engine.camera.focusOn(poi)` without re-resolving the id.
   * Ignored in galaxy mode.
   */
  onPoiFocus?: (poi: PointOfInterest) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button.
   * Same effect as pressing Esc on desktop — clears the pinned selection.
   * Only rendered when `pinned` is true (clearing the transient hover preview
   * makes no sense; it'll clear itself the moment the cursor moves).  When
   * omitted, the button is not rendered.  Applies to both galaxy AND POI
   * modes — the parent chooses which engine method to call based on which
   * selection is active.
   */
  onClose?: () => void;
};

// ── CardRow ────────────────────────────────────────────────────────────────────

/** Props for a single label/value row. */
type CardRowProps = {
  /**
   * The field label (left side).  Accepts plain strings for simple
   * rows and JSX so callers can wrap the label in an InfoTip without
   * sprouting a parallel CardRow component.
   */
  label: ReactNode;
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

// ── POI body ───────────────────────────────────────────────────────────────────

/**
 * Human-readable category label for the POI info card.
 *
 * Mirrors the underlying `PoiCategory` union (cluster / supercluster /
 * void / famousGalaxy).  Famous galaxies don't normally route through
 * the POI body (they have a full GalaxyInfo from the picker), but we
 * include a label for completeness so an unexpected `famousGalaxy`-
 * category POI focus doesn't render a blank "Type" row.
 */
function poiCategoryLabel(category: PointOfInterest['category']): string {
  switch (category) {
    case 'cluster':
      return 'Galaxy Cluster';
    case 'supercluster':
      return 'Supercluster';
    case 'void':
      return 'Cosmic Void';
    case 'famousGalaxy':
      return 'Famous Galaxy';
  }
}

/**
 * Render the POI variant of FullCard.
 *
 * Extracted as a plain function (not a sub-component) so it doesn't
 * introduce its own React fiber — the JSX it returns sits directly under
 * the same `<div className={outerClass}>` shape that the galaxy branch
 * uses.  That identity is what preserves any DOM-owned state across a
 * galaxy↔POI swap (see the InfoCard module header).
 *
 * Why a function and not inline JSX?  The mode branch in `FullCard`
 * would otherwise dwarf the galaxy body's ~150 lines of JSX with its
 * own 40-line block, making the function structure hard to scan.  A
 * named helper at module scope keeps each branch readable.
 */
function renderPoiBody(
  poi: PointOfInterest,
  outerClass: string,
  pinned: boolean,
  onClose: (() => void) | undefined,
  onPoiFocus: ((poi: PointOfInterest) => void) | undefined,
): ReactNode {
  // Distance from the observer (origin) — POIs live in heliocentric
  // world space, so the Euclidean magnitude of `worldPos` is the
  // observer-to-POI distance.  `Math.hypot` over three components is
  // the canonical way; gl-matrix would also work but pulling it in
  // here for a single magnitude calc is overkill.
  const distanceMpc = Math.hypot(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]);
  const categoryLabel = poiCategoryLabel(poi.category);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      {/* ── Title row ─────────────────────────────────────────────────────── */}
      {/*
        Same shape as the galaxy branch's title row so the visual chrome
        matches: "Object" eyebrow + PINNED badge (CSS-toggled) + optional
        close button.  We omit the per-galaxy "Focus" button — the POI
        equivalent ("Fly here") lives in the body where it has room to
        breathe and isn't competing with the close affordance.
      */}
      <div className={styles.cardTitle}>
        <span>POI</span>
        <span className={styles.pinnedBadge}>Pinned</span>
        {pinned && onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      <div className={styles.cardHeadline}>{poi.name}</div>

      {/* ── Category badge ────────────────────────────────────────────────── */}
      {/*
        Reuses the sourceBadge styling for visual consistency with the
        galaxy variant's "SDSS DR17" / "2MRS" attribution row.  Different
        semantic content (category vs catalog source) but same purpose:
        a small pill identifying what kind of thing the card describes.
      */}
      <div className={styles.sourceBadge}>{categoryLabel}</div>

      {/* ── Distance + radius rows ────────────────────────────────────────── */}
      <div className={styles.cardSection}>
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Distance</span>
          <span className={styles.cardValue}>{formatDistance(distanceMpc)}</span>
        </div>
        {poi.physicalRadiusMpc !== undefined && (
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Radius</span>
            <span className={styles.cardValue}>{formatDistance(poi.physicalRadiusMpc)}</span>
          </div>
        )}
      </div>

      {/* ── Fly-here action ───────────────────────────────────────────────── */}
      {/*
        Rendered only when the parent supplied `onPoiFocus`.  The button
        lives at the bottom of the card (mirroring where the galaxy
        variant's external "View on NED" link sits) so the user's eye
        ends on the primary call-to-action.  We reuse `focusButton`
        styling so the affordance reads the same as the galaxy variant's
        "Focus" button — same shape, same colour, same hover state.
      */}
      {onPoiFocus && (
        <button
          type="button"
          className={styles.focusButton}
          onClick={() => onPoiFocus(poi)}
          aria-label={`Fly camera to ${poi.name}`}
        >
          Fly here
        </button>
      )}
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
export function FullCard(props: FullCardProps): ReactNode {
  const { pinned = false, onFocus, onPoiFocus, onClose } = props;

  // ── Resolve the discriminated mode ───────────────────────────────────────
  //
  // Two prop shapes coexist (see FullCardProps docstring): explicit
  // `mode={{kind, ...}}` takes priority; legacy `info=…` becomes the
  // galaxy form.  Resolving here keeps the rest of the function body
  // free of the (mode ?? info-fallback) noise.
  //
  // If neither is provided (programmer error — InfoCard always passes
  // one), we render nothing rather than crash on a property access of
  // undefined.  The early return is safer than throwing for a UI
  // component that runs every render.
  const mode: FullCardMode | null =
    props.mode ?? (props.info ? { kind: 'galaxy' as const, info: props.info } : null);
  if (!mode) return null;

  // Compose the outer class: always infoCardFull, plus pinned variant when needed.
  // CSS modules scope both classes so we just combine them with a space.
  // Used by both the galaxy and POI branches — shared chrome means the
  // outer wrapper's tag + className stay stable across galaxy↔POI
  // transitions, preserving any `<details>` open state inside per the
  // InfoCard module header.
  const outerClass = pinned ? `${styles.infoCardFull} ${styles.pinned}` : `${styles.infoCardFull}`;

  // Hook must be called unconditionally (React rules-of-hooks), even
  // though the POI branch ignores it.  Cheap — a no-op `useState` is
  // a single slot in the fiber.  Kept BEFORE the mode-branch return so
  // hook order is identical across galaxy↔POI transitions.
  const [descExpanded, setDescExpanded] = useState(false);

  // ── POI branch ───────────────────────────────────────────────────────────
  //
  // Cluster / supercluster / void anchors render a compact body: name
  // (headline), category label, distance from observer, physical radius,
  // and a "Fly here" button when the parent supplied `onPoiFocus`.  No
  // photometry, no thumbnail, no <details> — those concepts don't apply
  // to a structure the size of Virgo.
  //
  // We deliberately reuse the same outer wrapper as the galaxy branch
  // (className, role, aria-live).  React reconciles by tag + className,
  // so flipping the card from showing a galaxy to showing a POI keeps
  // the same DOM node and any preserved DOM state (focus, scroll, native
  // <details>) survives the transition without us lifting it into React
  // state.
  if (mode.kind === 'poi') {
    // Append the .poi modifier so the card's min-width matches the
    // galaxy card's typical filled width (see FullCard.module.css).
    // Same className composition pattern as the pinned variant; React
    // reconciles by tag+key, so changing className is a style update
    // — the underlying div fiber is unchanged across galaxy↔POI swaps.
    return renderPoiBody(mode.poi, `${outerClass} ${styles.poi}`, pinned, onClose, onPoiFocus);
  }

  // ── Galaxy branch ────────────────────────────────────────────────────────
  const { info } = mode;

  // Curated descriptions can run multiple paragraphs (especially for nearby
  // famous galaxies whose Wikipedia summaries are long).  Default to a 5-line
  // clamp + "show more" toggle so the card's structured-data rows stay
  // visible without scrolling.  `descExpanded` state resets per component
  // instance, so selecting a different galaxy starts fresh in the collapsed
  // state.

  // Aliases shown in "Also known as": every famous-catalog alias that
  // isn't already the headline.  Computed once so the same predicate
  // handles both cases — commonName-headline ("Andromeda Galaxy")
  // surfaces ALL of `names` (M31, NGC 224); names[0]-headline ("M110")
  // surfaces names[1..] effectively.
  const famousAliases = info.famous?.names.filter((n) => n !== info.displayName) ?? [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      {/* ── Title row ─────────────────────────────────────────────────────── */}
      <div className={styles.cardTitle}>
        <span>Object</span>
        {/* The PINNED badge is always in the DOM; CSS shows/hides via .pinned */}
        <span className={styles.pinnedBadge}>Pinned</span>
        {/*
          Focus button — only rendered when the card is pinned AND a callback
          was supplied.  We pass the full GalaxyInfo so the parent can pull the
          world coordinates (for the camera tween) without re-doing the lookup.
        */}
        {pinned && onFocus && (
          <button
            type="button"
            className={styles.focusButton}
            onClick={() => onFocus(info)}
            aria-label={`Focus camera on ${info.displayName}`}
          >
            Focus
          </button>
        )}
        {/*
          Close button — same affordance as Esc, but visible.  Especially
          useful on touch devices where there's no Esc key.  Uses a real
          × glyph (U+00D7 MULTIPLICATION SIGN) rather than the ASCII letter
          'x' for consistent rendering across fonts.
        */}
        {pinned && onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Clear selection"
            title="Clear selection (Esc)"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      {/*
        `info.displayName` carries the priority-resolved best human-readable
        name for the row: curated primary name for Famous, `PGC <n>` for
        2MRS rows with a real PGC, IAU coord designation otherwise.  See
        `galaxyInfoBuilder.ts` for the ladder.
      */}
      <div className={styles.cardHeadline}>{info.displayName}</div>

      {/* ── Source attribution badge ──────────────────────────────────────── */}
      <div className={styles.sourceBadge}>{info.sourceLabel}</div>

      {/* ── Famous-atlas detail block ─────────────────────────────────────── */}
      {info.famous && (
        <div className={styles.cardSection}>
          {/*
            "Also known as" — see `famousAliases` above.  Many famous
            galaxies have an NGC number AND a common name (e.g. M31 /
            NGC 224 / Andromeda Galaxy); listing the non-headline
            aliases makes the InfoCard recognisable to users coming
            from any naming convention.
          */}
          {famousAliases.length > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Also known as</span>
              <span className={styles.cardValue}>{famousAliases.join(' · ')}</span>
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
                className={cx(
                  styles.cardValue,
                  descExpanded ? styles.descExpanded : styles.descCollapsed,
                )}
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
      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        <Thumbnail ra={info.ra} dec={info.dec} url={info.thumbnailUrl} />
        <div className={styles.cardSummary}>
          {/* Friendly lookback line — the most memorable single fact about this galaxy. */}
          <div className={styles.cardLookbackLine}>
            <InfoTip {...TIPS.lookback!}>Light left</InfoTip> {info.lookbackGyr.toFixed(1)} Gyr ago
          </div>
          <div className={styles.cardLookbackEra}>
            — <InfoTip {...TIPS.earthEra!}>{info.earthEra}</InfoTip>
          </div>
          <div className={styles.cardDistLine}>
            <InfoTip {...TIPS.distance!}>{formatDistance(info.distanceMpc)}</InfoTip> &middot;{' '}
            <InfoTip {...TIPS.hubbleVelocity!}>
              {Math.round(info.hubbleVelocityKmS).toLocaleString()} km/s away
            </InfoTip>
          </div>
          <div className={styles.cardTypeLine}>{info.galaxyType.description}</div>
        </div>
      </div>

      {/* ── Coordinate rows ───────────────────────────────────────────────── */}
      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.ra!}>RA</InfoTip>}
          value={
            <>
              {info.raSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.ra.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow
          label={<InfoTip {...TIPS.dec!}>Dec</InfoTip>}
          value={
            <>
              {info.decSexagesimal}&nbsp;&nbsp;/&nbsp;&nbsp;{info.dec.toFixed(4)}&deg;
            </>
          }
        />
        <CardRow
          label={<InfoTip {...TIPS.redshift!}>Redshift z</InfoTip>}
          value={info.redshift.toFixed(4)}
        />
        {/*
          The g-slot label is source-aware: SDSS reports actual g-band, but
          2MRS puts J in this slot and GLADE puts B in this slot.  Showing the
          real band name (info.bands.g) keeps the row honest for non-SDSS
          galaxies where "(g)" would have been a quiet lie.
        */}
        <CardRow
          label={<InfoTip {...TIPS.apparentMag!}>{`Apparent mag (${info.bands.g})`}</InfoTip>}
          value={Number.isFinite(info.magG) ? info.magG.toFixed(2) : 'N/A'}
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
            label={<InfoTip {...TIPS.absoluteMag!}>{`Absolute mag (${info.bands.g})`}</InfoTip>}
            value={Number.isFinite(info.absoluteMagG) ? info.absoluteMagG.toFixed(2) : 'N/A'}
          />
          {/*
            Colour row uses the pre-computed `info.colours` array instead of
            hardcoding u−g/g−r/r−i. This is the only place the Card cares
            about which bands a survey actually carries — galaxyInfoBuilder
            decides which adjacent-slot pairs to include based on which
            bands are present, so SDSS gets three colours, 2MRS two, GLADE
            three (B−J/J−H/H−K), Synthetic three.  If a row has no usable
            colours (all NaN), we hide the row entirely rather than render
            an empty value.
          */}
          {info.colours.length > 0 && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>
                <InfoTip {...TIPS.colour!}>Colour</InfoTip>
              </span>
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
            label={<InfoTip {...TIPS.orientation!}>Orientation</InfoTip>}
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
            label={<InfoTip {...TIPS.diameter!}>Diameter</InfoTip>}
            value={
              <>
                {formatDiameterKpc(info.diameterKpc)}
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
            <code className={cx(styles.cardValue, styles.cardObjid)}>{String(info.objID)}</code>
          </div>
        </div>
      </details>

      {/* ── External link ─────────────────────────────────────────────────── */}
      {/*
        `rel="noopener"` prevents the opened tab from accessing this window via
        `window.opener` — a standard security practice for any `target="_blank"`
        link.  Without it a malicious (or compromised) page could navigate the
        opener to a phishing URL.  `noreferrer` would also suppress the Referer
        header, but that's not needed here since both SDSS and NED are trusted
        public resources.

        Label varies by source: SDSS rows go to the SDSS Explorer page;
        everything else goes to NED (either via byname for rows where we
        retain a real catalogue ID, or via near-position search where we
        only have coords).  See `galaxyInfoBuilder.ts` for the URL-picking
        logic and `nedUrl.ts` for the URL builders themselves.

        Synthetic-cloud rows are the only case where we can't produce a
        useful catalogue link — `catalogUrl === null` then, and we render
        a disabled-looking note instead of a link that would 404.
      */}
      {info.catalogUrl ? (
        <a className={styles.externalLink} href={info.catalogUrl} target="_blank" rel="noopener">
          {info.source === Source.SDSS ? 'View in SDSS Explorer' : 'View on NED'}
          {' →'}
        </a>
      ) : (
        <div className={cx(styles.externalLink, styles.externalLinkDisabled)}>
          No catalogue page for {info.sourceLabel}
        </div>
      )}
    </div>
  );
}
