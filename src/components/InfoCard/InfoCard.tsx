/**
 * InfoCard — routes hovered/selected galaxy + POI state into the detail and
 * preview cards.  Renders nothing when both slots are null.
 *
 * Always renders the same outer wrapper across all states.  An earlier version
 * returned a child unwrapped in the single-card case; the resulting tag change
 * across the single↔pair transition forced React to remount the detail card,
 * which lost the native `<details>` "More details" open state on every hover.
 *
 * As of the unify-focus-clear refactor (2026-05-19), both `hovered` and
 * `selected` accept the full `FocusableTarget` union (`GalaxyInfo |
 * PointOfInterest`).  App.tsx merges POI and galaxy state before handing
 * them here — POI wins when both are present.  InfoCard then dispatches
 * via `isPoi` into typed sub-slots and picks the right detail-card
 * variant (`GalaxyDetailCard` vs `PoiDetailCard`).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { isPoi } from '../../services/engine/isPoi';
import { GalaxyDetailCard } from './GalaxyDetailCard';
import { PoiDetailCard } from './PoiDetailCard';
import { CompactCard } from './CompactCard';
import { CompactPoiCard } from './CompactPoiCard';
import styles from './InfoCard.module.css';

export type InfoCardProps = {
  /**
   * The point currently under the cursor, or null when the cursor is on empty
   * sky.  Can be either a galaxy or a POI — InfoCard dispatches via `isPoi`
   * to render the appropriate hover variant.
   */
  hovered: FocusableTarget | null;
  /**
   * The pinned/selected target, or null when nothing is pinned.  Same dispatch
   * as `hovered`.  When both `hovered` and `selected` are non-null and of the
   * same kind (galaxy/galaxy or poi/poi), the stacked-pair layout applies;
   * when they're different kinds (e.g. galaxy pinned, POI hovered), both render
   * in their respective slots.
   */
  selected: FocusableTarget | null;
  /**
   * Catalogued galaxy count for the pinned structure (cluster / supercluster
   * / void), or null/undefined when not applicable.  Forwarded to
   * PoiDetailCard, which renders it as the "Galaxies" row.  Ignored for
   * galaxy selections (GalaxyDetailCard has no such row).
   */
  selectedMemberCount?: number | null;
  /**
   * Optional callback fired when the user clicks "Focus" (galaxy) or "Fly here"
   * (POI) on the pinned card.  Caller routes to the unified handle method
   * `handle.camera.focusOn(target)`.
   */
  onFocus?: (target: FocusableTarget) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on the
   * pinned card.  Same effect as pressing Esc — clears the selection.  Caller
   * routes to `handle.selection.clear()` which tears down both galaxy AND POI
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

  // Dispatch via isPoi into typed sub-slots.  PointOfInterest is identified
  // by a top-level `category` field; GalaxyInfo carries category only at
  // `galaxyType.category`.  See isPoi.ts for the discriminant rationale.
  const selectedPoi = selected && isPoi(selected) ? selected : null;
  const selectedGalaxy = selected && !isPoi(selected) ? (selected as GalaxyInfo) : null;
  const hoveredPoi = hovered && isPoi(hovered) ? hovered : null;
  const hoveredGalaxy = hovered && !isPoi(hovered) ? (hovered as GalaxyInfo) : null;

  // POI hover wins over galaxy hover when both are non-null (a transient
  // cross-render race; the engine's hover throttler normally clears the
  // "other" sink).  POI hover is also suppressed when the SAME POI is
  // already pinned — PoiDetailCard above already shows that content.
  const showPoiHover = hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;
  const showGalaxyHover = hoveredGalaxy != null && !showPoiHover;

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <PoiDetailCard
          poi={selectedPoi}
          pinned
          memberCount={selectedMemberCount}
          onFocus={onFocus}
          onClose={onClose}
        />
        {showGalaxyHover && <CompactCard info={hoveredGalaxy!} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  const isStacked =
    showGalaxyHover && selectedGalaxy != null && hoveredGalaxy!.index !== selectedGalaxy.index;
  const detailInfo: GalaxyInfo | null = isStacked
    ? selectedGalaxy
    : showGalaxyHover
      ? hoveredGalaxy
      : (selectedGalaxy ?? null);
  const detailPinned = isStacked ? true : !showGalaxyHover;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {detailInfo && (
        <GalaxyDetailCard
          info={detailInfo}
          pinned={detailPinned}
          onFocus={detailPinned ? onFocus : undefined}
          onClose={detailPinned ? onClose : undefined}
        />
      )}
      {isStacked && <CompactCard info={hoveredGalaxy!} />}
      {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
    </div>
  );
}
