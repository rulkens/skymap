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
 * (`GalaxyInfo | StructureInfo`).  App.tsx merges structure and galaxy state
 * before handing them here — structure wins when both are present.  InfoCard then
 * dispatches via the `DETAIL_CARD` table (keyed on `target.type`) to pick the
 * right detail-card and compact-preview variant for each slot, so adding a new
 * focusable kind is a new table row rather than a new branch here.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { DETAIL_CARD } from './detailCardTable';
import styles from './InfoCard.module.css';

export type InfoCardProps = {
  /**
   * The point currently under the cursor, or null when the cursor is on empty
   * sky.  Can be either a galaxy or a structure — InfoCard dispatches via the
   * `DETAIL_CARD` table to render the appropriate hover variant.
   */
  hovered: FocusableTarget | null;
  /**
   * The pinned/selected target, or null when nothing is pinned.  Same dispatch
   * as `hovered`.  When both `hovered` and `selected` are non-null and of the
   * same kind (galaxy/galaxy or structure/structure), the stacked-pair layout applies;
   * when they're different kinds (e.g. galaxy pinned, structure hovered), both render
   * in their respective slots.
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
  if (!hovered && !selected) return null;

  // Split each slot into its concrete arm by the union tag (`type`) rather than
  // a structural sniff.  These narrowed locals drive the id/index comparisons
  // below; the cards themselves are picked from the DETAIL_CARD table.
  const selectedStructure = selected?.type === 'structure' ? selected : null;
  const selectedGalaxy = selected?.type === 'galaxyCatalog' ? selected : null;
  const hoveredStructure = hovered?.type === 'structure' ? hovered : null;
  const hoveredGalaxyAny = hovered?.type === 'galaxyCatalog' ? hovered : null;

  // Structure hover wins over galaxy hover when both are non-null (a transient
  // cross-render race; the engine's hover throttler normally clears the
  // "other" sink).  Structure hover is also suppressed when the SAME structure
  // is already pinned — the pinned detail card above already shows that content.
  const showStructureHover =
    hoveredStructure != null && hoveredStructure.id !== selectedStructure?.id;
  const showGalaxyHover = hoveredGalaxyAny != null && !showStructureHover;
  const hoveredGalaxy = showGalaxyHover ? hoveredGalaxyAny : null;

  // Pinned structure path: structure detail card on top, then any galaxy /
  // structure hover preview below.
  if (selectedStructure) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        {DETAIL_CARD.structure.Detail({
          target: selectedStructure,
          pinned: true,
          selectedMemberCount,
          onFocus,
          onClose,
        })}
        {hoveredGalaxy && DETAIL_CARD.galaxyCatalog.Compact({ target: hoveredGalaxy })}
        {showStructureHover && DETAIL_CARD.structure.Compact({ target: hoveredStructure })}
      </div>
    );
  }

  // Galaxy path: the detail slot shows the pinned galaxy (stacked over a
  // hovered second galaxy) or, with nothing pinned, the hovered galaxy itself.
  const isStacked =
    hoveredGalaxy != null && selectedGalaxy != null && hoveredGalaxy.index !== selectedGalaxy.index;
  const detailTarget: FocusableTarget | null = isStacked
    ? selectedGalaxy
    : (hoveredGalaxy ?? selectedGalaxy);
  const detailPinned = isStacked ? true : hoveredGalaxy == null;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {detailTarget &&
        DETAIL_CARD.galaxyCatalog.Detail({
          target: detailTarget,
          pinned: detailPinned,
          onFocus,
          onClose,
        })}
      {isStacked && hoveredGalaxy && DETAIL_CARD.galaxyCatalog.Compact({ target: hoveredGalaxy })}
      {showStructureHover && DETAIL_CARD.structure.Compact({ target: hoveredStructure })}
    </div>
  );
}
