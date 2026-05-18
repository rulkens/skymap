/**
 * InfoCard — routes hovered/selected galaxy + POI state into the detail and
 * preview cards.  Renders nothing when all four slots are null.
 *
 * Always renders the same outer wrapper across all states.  An earlier version
 * returned a child unwrapped in the single-card case; the resulting tag change
 * across the single↔pair transition forced React to remount the detail card,
 * which lost the native `<details>` "More details" open state on every hover.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { GalaxyDetailCard } from './GalaxyDetailCard';
import { PoiDetailCard } from './PoiDetailCard';
import { CompactCard } from './CompactCard';
import { CompactPoiCard } from './CompactPoiCard';
import styles from './InfoCard.module.css';

export type InfoCardProps = {
  hovered: GalaxyInfo | null;
  selected: GalaxyInfo | null;
  selectedPoi?: PointOfInterest | null;
  hoveredPoi?: PointOfInterest | null;
  onFocus?: (info: GalaxyInfo) => void;
  onPoiFocus?: (poi: PointOfInterest) => void;
  onClose?: () => void;
  onPoiClose?: () => void;
};

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
  if (!hovered && !selected && !selectedPoi && !hoveredPoi) return null;

  // POI hover wins over galaxy hover when both are non-null (a transient
  // cross-render race; the engine's hover throttler normally clears the
  // "other" sink).  POI hover is also suppressed when the SAME POI is
  // already pinned — PoiDetailCard above already shows that content.
  const showPoiHover = hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;
  const showGalaxyHover = hovered != null && !showPoiHover;

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <PoiDetailCard
          poi={selectedPoi}
          pinned
          onFocus={onPoiFocus}
          onClose={onPoiClose}
        />
        {showGalaxyHover && <CompactCard info={hovered!} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  const isStacked =
    showGalaxyHover && selected != null && hovered!.index !== selected.index;
  const detailInfo: GalaxyInfo | null = isStacked
    ? selected
    : (showGalaxyHover ? hovered : selected ?? null);
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
      {isStacked && <CompactCard info={hovered!} />}
      {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
    </div>
  );
}
