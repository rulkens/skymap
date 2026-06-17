/**
 * CompactStructureCard — slim hover-preview for a cluster / supercluster / void.
 * Structure variant of CompactCard, kept as a sibling file so the two can
 * diverge (different distance derivation, different secondary line).
 */

import type { ReactNode } from 'react';
import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import { formatDistance } from '../../utils/format/formatDistance';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { CardRow } from './CardRow';
import styles from './CompactStructureCard.module.css';

export type CompactStructureCardProps = {
  structure: StructureInfo;
};

export function CompactStructureCard({ structure }: CompactStructureCardProps): ReactNode {
  const distanceMpc = Math.hypot(
    structure.worldPos[0],
    structure.worldPos[1],
    structure.worldPos[2],
  );

  return (
    <div className={styles.infoCardCompact} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline" badge={CATEGORY_DISPLAY_INFO[structure.category].shortLabel}>
        {structure.name}
      </CardRow>
      <div className={styles.cardDistLine}>
        {formatDistance(distanceMpc)}
        <> &middot; r {formatDistance(structure.physicalRadiusMpc)}</>
      </div>
    </div>
  );
}
