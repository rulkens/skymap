/**
 * InfoCard — routes hovered/selected galaxy + structure state into the detail and
 * preview cards.  Renders nothing when both slots are null.
 *
 * Always renders the same outer wrapper across all states.  An earlier version
 * returned a child unwrapped in the single-card case; the resulting tag change
 * across the single↔pair transition forced React to remount the detail card,
 * which lost the native `<details>` "More details" open state on every hover.
 *
 * Both `hovered` and `selected` accept the full `FocusableTarget` union
 * (`GalaxyInfo | StructureInfo | MilkyWayInfo`).  Dispatch is entirely
 * table-driven: `DETAIL_CARD[target.type]` picks the detail + compact card for
 * whichever target lands in each slot, so there is no per-kind branching and a
 * new focusable kind is one table row.  The only logic here is slot precedence —
 * pinned target → detail, a different hovered target → compact preview.
 *
 * On mobile (`useIsMobile`) hover has no cursor, so the card drops to a single
 * MobileSheet showing only the selected target's full detail — no compact slot.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { targetEq } from '../../services/engine/helpers/targetEq';
import { TARGET_IDENTITY_KEY } from '../../services/engine/helpers/targetIdentityKey';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DETAIL_CARD } from './detailCardTable';
import MobileSheet from './MobileSheet/MobileSheet';
import styles from './InfoCard.module.css';

export type InfoCardProps = {
  /**
   * The point currently under the cursor, or null when the cursor is on empty
   * sky.  Can be either a galaxy or a structure — InfoCard dispatches via the
   * `DETAIL_CARD` table to render the appropriate hover variant.
   */
  hovered: FocusableTarget | null;
  /**
   * The pinned/selected target, or null when nothing is pinned.  Owns the detail
   * slot; a hovered target naming a different thing renders beneath as a compact
   * preview.  When `hovered` and `selected` are the same thing, the preview is
   * suppressed (the detail card already shows it).
   */
  selected: FocusableTarget | null;
  /**
   * Catalogued galaxy count for the pinned structure (cluster / supercluster
   * / void), or null/undefined when not applicable.  Forwarded to
   * StructureDetailCard, which renders it as the "Galaxies" row.  Ignored for
   * galaxy selections (GalaxyDetailCard has no such row).
   */
  selectedMemberCount?: number | null;
  /**
   * Optional callback fired when the user clicks "Focus" (galaxy) or "Fly here"
   * (structure) on the pinned card.  Caller routes to the unified handle method
   * `handle.camera.focusOn(target)`.
   */
  onFocus?: (target: FocusableTarget) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on the
   * pinned card.  Same effect as pressing Esc — clears the selection.  Caller
   * routes to `handle.selection.clear()` which tears down both galaxy AND structure
   * selection in one call.
   */
  onClose?: () => void;
};

export function InfoCard({
  hovered,
  selected,
  selectedMemberCount,
  onFocus,
  onClose,
}: InfoCardProps): ReactNode {
  const isMobile = useIsMobile();

  // Mobile has no hover cursor: only the pinned target matters, and it shows as
  // a single MobileSheet wrapping the same Detail card the desktop branch uses.
  if (isMobile) {
    if (selected === null) return null;
    return (
      <MobileSheet resetKey={TARGET_IDENTITY_KEY[selected.type](selected)}>
        {DETAIL_CARD[selected.type].Detail({
          target: selected,
          pinned: true,
          selectedMemberCount,
          onFocus,
          onClose,
        })}
      </MobileSheet>
    );
  }

  if (!hovered && !selected) return null;

  // Two slots, both dispatched by the target's union tag through DETAIL_CARD —
  // no per-kind branching.  The selected target owns the detail card; a hovered
  // target naming a *different* thing shows beneath it as a compact preview
  // (`targetEq` suppresses the redundant preview of an already-pinned target).
  // Adding a focusable kind is a DETAIL_CARD row, never a branch here.
  const compactTarget = hovered !== null && !targetEq(hovered, selected) ? hovered : null;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {selected &&
        DETAIL_CARD[selected.type].Detail({
          target: selected,
          pinned: true,
          selectedMemberCount,
          onFocus,
          onClose,
        })}
      {compactTarget && DETAIL_CARD[compactTarget.type].Compact({ target: compactTarget })}
    </div>
  );
}
