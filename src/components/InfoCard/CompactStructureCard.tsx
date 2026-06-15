/**
 * CompactStructureCard — slim hover-preview for a cluster / supercluster / void.
 * Structure variant of CompactCard, kept as a sibling file so the two can
 * diverge (different distance derivation, different secondary line).
 */

import type { ReactNode } from 'react';
import type { StructureRecord } from '../../@types/engine/data/StructureRecord';
import { formatDistance } from '../../utils/format/formatDistance';
import { CATEGORY_DISPLAY_INFO } from '../../data/categoryDisplayInfo';
import styles from './CompactStructureCard.module.css';

export type CompactStructureCardProps = {
  structure: StructureRecord;
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
      <div className={styles.headlineRow}>
        <div className={styles.cardHeadline}>{structure.name}</div>
        <span className={styles.sourceBadge}>
          {CATEGORY_DISPLAY_INFO[structure.category].shortLabel}
        </span>
      </div>
      <div className={styles.cardDistLine}>
        {formatDistance(distanceMpc)}
        <> &middot; r {formatDistance(structure.physicalRadiusMpc)}</>
      </div>
    </div>
  );
}
