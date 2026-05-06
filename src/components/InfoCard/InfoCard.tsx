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
import type { PointInfo } from '../../@types';
import { FullCard } from './FullCard';
import { CompactCard } from './CompactCard';
import styles from './InfoCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for InfoCard.
 *
 * Both fields are nullable: when neither is set the component renders nothing.
 */
export type InfoCardProps = {
  /** The point currently under the cursor, or null when the cursor is on empty sky. */
  hovered: PointInfo | null;
  /** The pinned/selected point, or null when nothing is pinned. */
  selected: PointInfo | null;
  /**
   * Optional callback fired when the user clicks "Focus" on the pinned card.
   * Forwarded to FullCard; ignored on the compact hover card.
   */
  onFocus?: (info: PointInfo) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on the
   * pinned card.  Same effect as pressing Esc — clears the selection.
   * Forwarded to FullCard; ignored on the compact hover card.
   */
  onClose?: () => void;
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
export function InfoCard({ hovered, selected, onFocus, onClose }: InfoCardProps): ReactNode {
  // Nothing to show — stay entirely out of the DOM.
  if (!hovered && !selected) return null;

  // ── Routing: which info goes into the FullCard, and is there a CompactCard? ──
  //
  // Two cases:
  //   1. Both hovered AND selected, and they're different points → the
  //      FullCard shows the pinned (selected) galaxy and a CompactCard
  //      below it shows the hover preview.
  //   2. Otherwise → only the FullCard, fed by hovered ?? selected.  The
  //      "pinned" badge appears when the FullCard is showing the selection
  //      (i.e. the cursor has moved off-canvas or onto the same galaxy).
  //
  // Crucially we ALWAYS render the same outer wrapper structure regardless
  // of which case we're in.  An earlier version returned the FullCard
  // unwrapped in the single-card case; that meant React saw a different
  // top-level element type when the user moved the cursor onto a second
  // galaxy, which forced a full unmount/remount of the FullCard and lost
  // the native `<details>` "More details" open state every time.
  const isStacked = hovered != null && selected != null && hovered.index !== selected.index;
  const fullCardInfo = isStacked ? selected! : (hovered ?? selected!);
  const fullCardPinned = isStacked ? true : !hovered;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      <FullCard
        info={fullCardInfo}
        pinned={fullCardPinned}
        onFocus={fullCardPinned ? onFocus : undefined}
        onClose={fullCardPinned ? onClose : undefined}
      />
      {isStacked && <CompactCard info={hovered!} />}
    </div>
  );
}
