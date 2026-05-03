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
 * ### Architecture
 *
 * This file contains only the routing component.  The three display variants
 * live in sibling files: FullCard.tsx, CompactCard.tsx, Thumbnail.tsx.
 * An index.ts re-exports this component as the public surface of the module.
 *
 * All components are pure functions of their props — no local state is needed
 * because the engine drives all changes via callbacks up to App.tsx.
 */

import type { ReactNode } from 'react';
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
export function InfoCard({ hovered, selected, onFocus }: InfoCardProps): ReactNode {
  // Nothing to show — stay entirely out of the DOM.
  if (!hovered && !selected) return null;

  // When BOTH hovered and selected are set AND they point to different points,
  // render a stacked pair: full pinned card on top, compact hover card below.
  if (hovered && selected && hovered.index !== selected.index) {
    // Apply both the module-scoped class (for layout) and a global marker class
    // (infoCardStack) so that FullCard.module.css can override the fixed
    // positioning of child FullCard elements via:
    //   :global(.infoCardStack) .infoCardFull { position: relative; … }
    return (
      <div className={`${styles.infoCardStack} infoCardStack`}>
        <FullCard info={selected} pinned={true} onFocus={onFocus} />
        <CompactCard info={hovered} />
      </div>
    );
  }

  // Single-card case: hovered takes precedence (live preview); fall back to
  // selected when the cursor has moved off canvas.
  const info = hovered ?? selected!;
  const pinned = !hovered; // only show PINNED badge when falling back to selection
  // Forward onFocus only when we're showing the pinned card — the hover preview
  // never gets a Focus button regardless of whether the prop is supplied.
  return <FullCard info={info} pinned={pinned} onFocus={pinned ? onFocus : undefined} />;
}
