/**
 * InfoCard — the routing/logic layer for the galaxy info overlay.
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
 * ### Why we always render the same outer wrapper
 *
 * The wrapping `<div className={styles.infoCardStack}>` is rendered the same
 * way in both single-card and stacked-pair states.  Earlier this component
 * conditionally unwrapped the FullCard out of the stack div in the single-
 * card case — but that meant React saw a different top-level element type
 * across the single↔pair transition, which forced a full unmount/remount of
 * the FullCard.  The most user-visible consequence: the native `<details>`
 * "More details" disclosure inside FullCard lost its `open` state every
 * time the user moved the cursor onto a second galaxy.
 *
 * Keeping the wrapper stable across all renders preserves the FullCard's
 * DOM identity, so the browser's `<details>` element retains its open/
 * closed state without us needing to lift it into React state.
 *
 * ### Architecture
 *
 * This file contains only the routing component.  The three display variants
 * live in sibling files: FullCard.tsx, CompactCard.tsx, Thumbnail.tsx.
 *
 * All components are pure functions of their props — no local state is needed
 * because the engine drives all changes via callbacks up to App.tsx.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { FullCard } from './FullCard';
import { CompactCard } from './CompactCard';
import { CompactPoiCard } from './CompactPoiCard';
import styles from './InfoCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for InfoCard.
 *
 * Both fields are nullable: when neither is set the component renders nothing.
 */
export type InfoCardProps = {
  /** The point currently under the cursor, or null when the cursor is on empty sky. */
  hovered: GalaxyInfo | null;
  /** The pinned/selected point, or null when nothing is pinned. */
  selected: GalaxyInfo | null;
  /**
   * The currently-focused POI (cluster / supercluster / void), or null
   * when no POI is selected.
   *
   * When non-null, the FullCard renders a POI-flavoured body instead of
   * the galaxy body.  POI selection coexists with galaxy hover (so a
   * user with a Virgo POI card open who hovers a galaxy still sees the
   * hover preview stack below).  POI selection takes priority over a
   * pinned-galaxy selection — the POI click flow clears the galaxy
   * selection at the engine level anyway, but the priority ordering
   * here is the belt-and-braces guarantee.
   */
  selectedPoi?: PointOfInterest | null;
  /**
   * The POI currently under the cursor, or null when no POI is hovered.
   *
   * Rendered as a slim `CompactPoiCard` panel below the pinned card
   * (or standalone, when nothing is pinned) UNLESS it's the SAME POI as
   * `selectedPoi` — in which case the pinned full card already shows
   * the user everything the preview would, and the preview is
   * suppressed to avoid a redundant DOM panel.  Mirrors the galaxy
   * hover etiquette (`isStacked` checks `hovered.index !== selected.index`).
   *
   * Coexists with galaxy `hovered`: a single pick resolves to EITHER a
   * galaxy OR a POI (see runFrame.ts's hover-throttler dispatch), so
   * the two `hovered*` slots are mutually exclusive in practice.  In
   * the rare frame where both are non-null (e.g. a hand-off mid-frame),
   * both compact panels render; visual stacking handles the rest.
   */
  hoveredPoi?: PointOfInterest | null;
  /**
   * Optional callback fired when the user clicks "Focus" on the pinned card.
   * Forwarded to FullCard; ignored on the compact hover card.
   */
  onFocus?: (info: GalaxyInfo) => void;
  /**
   * Optional callback fired when the user clicks "Fly here" on a POI card.
   * Forwarded to FullCard's POI variant.
   */
  onPoiFocus?: (poi: PointOfInterest) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on the
   * pinned card.  Same effect as pressing Esc — clears the selection.
   * Forwarded to FullCard; ignored on the compact hover card.
   */
  onClose?: () => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on a
   * POI card.  Parallel to `onClose` but for the POI variant — separate so
   * the parent can target the engine's `clearPoiFocus` instead of the
   * galaxy `selection.clear`.
   */
  onPoiClose?: () => void;
};

// ── InfoCard ───────────────────────────────────────────────────────────────────

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
export function InfoCard({
  hovered,
  selected,
  selectedPoi,
  hoveredPoi,
  onFocus,
  onPoiFocus,
  onClose,
  onPoiClose,
}: InfoCardProps): ReactNode {
  // Nothing to show — stay entirely out of the DOM.  All four selection
  // slots must be null; any one of them is enough to keep the card on
  // screen.  Hovered-POI alone (no pinned card, no galaxy) is the
  // common case for "cursor parked over a ring with no active pin".
  if (!hovered && !selected && !selectedPoi && !hoveredPoi) return null;

  // Suppression rule for the POI hover preview: hide when the SAME POI
  // is already pinned.  The pinned FullCard already shows the user
  // every field the preview would, so a second compact panel below it
  // is pure noise.  Mirrors the galaxy `isStacked` rule
  // (`hovered.index !== selected.index`).
  //
  // Defensive: `selectedPoi?.id` is undefined when `selectedPoi` is
  // null/undefined, which never equals a real POI id — so a hovered POI
  // with no pinned POI flows through correctly.
  const showPoiHover =
    hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;

  // ── Routing: which info goes into the FullCard, and is there a CompactCard? ──
  //
  // Three cases:
  //   1. `selectedPoi` is non-null → POI takes priority.  The FullCard
  //      renders the POI body; a CompactCard below shows the galaxy
  //      hover preview when present (rare in practice — POI clicks
  //      typically clear any pinned galaxy at the engine level).
  //   2. Both hovered AND selected (galaxies), and they're different
  //      points → the FullCard shows the pinned (selected) galaxy and
  //      a CompactCard below it shows the hover preview.
  //   3. Otherwise → only the FullCard, fed by hovered ?? selected.
  //      The "pinned" badge appears when the FullCard is showing the
  //      selection (i.e. the cursor has moved off-canvas or onto the
  //      same galaxy).
  //
  // Crucially we ALWAYS render the same outer wrapper structure
  // regardless of which case we're in — same tag, same className, same
  // role of the FullCard child.  An earlier version returned the
  // FullCard unwrapped in the single-card case; that meant React saw a
  // different top-level element type when the user moved the cursor
  // onto a second galaxy, which forced a full unmount/remount of the
  // FullCard and lost the native `<details>` "More details" open state
  // every time.  The galaxy↔POI transition uses the same FullCard
  // outer-`<div>` shape (className `infoCardFull`), so the same
  // reasoning applies: switching between cluster anchor and galaxy
  // body preserves any DOM-owned state inside.

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <FullCard
          mode={{ kind: 'poi', poi: selectedPoi }}
          pinned
          onPoiFocus={onPoiFocus}
          onClose={onPoiClose}
        />
        {hovered && <CompactCard info={hovered} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  // Galaxy / hover-only branch.  `fullCardInfo` may now be null when
  // the ONLY active slot is `hoveredPoi` (no galaxy hover, no galaxy
  // pin, no POI pin) — guard the FullCard render so we don't pass null
  // into FullCard's required `info` prop.
  const isStacked = hovered != null && selected != null && hovered.index !== selected.index;
  const fullCardInfo: GalaxyInfo | null = isStacked
    ? selected
    : (hovered ?? selected ?? null);
  const fullCardPinned = isStacked ? true : !hovered;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {fullCardInfo && (
        <FullCard
          info={fullCardInfo}
          pinned={fullCardPinned}
          onFocus={fullCardPinned ? onFocus : undefined}
          onClose={fullCardPinned ? onClose : undefined}
        />
      )}
      {isStacked && <CompactCard info={hovered!} />}
      {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
    </div>
  );
}
