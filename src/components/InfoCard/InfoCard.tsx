/**
 * InfoCard — routes hovered/selected galaxy + POI state into FullCard /
 * CompactCard / CompactPoiCard.  Renders nothing when all four slots are null.
 *
 * Always renders the same outer wrapper across all states.  An earlier version
 * returned the FullCard unwrapped in the single-card case; the resulting tag
 * change across the single↔pair transition forced React to remount FullCard,
 * which lost the native `<details>` "More details" open state on every hover.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import { FullCard } from './FullCard';
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
  // already pinned — the FullCard above already shows that content.
  const showPoiHover = hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;
  const showGalaxyHover = hovered != null && !showPoiHover;

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <FullCard
          mode={{ kind: 'poi', poi: selectedPoi }}
          pinned
          onPoiFocus={onPoiFocus}
          onClose={onPoiClose}
        />
        {showGalaxyHover && <CompactCard info={hovered!} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  const isStacked =
    showGalaxyHover && selected != null && hovered!.index !== selected.index;
  const fullCardInfo: GalaxyInfo | null = isStacked
    ? selected
    : (showGalaxyHover ? hovered : selected ?? null);
  const fullCardPinned = isStacked ? true : !showGalaxyHover;

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
