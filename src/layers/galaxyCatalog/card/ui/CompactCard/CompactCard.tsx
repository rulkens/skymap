/**
 * CompactCard — slim hover-preview for a galaxy, rendered below the pinned
 * GalaxyDetailCard when a second galaxy is hovered.  No thumbnail, no
 * expandable section, no actions.
 */

import type { ReactNode } from 'react';
import type { GalaxyInfo } from '../../../records/@types/GalaxyInfo';
import type { FamousGalaxyMetaEntry } from '../../../../../@types/loading/FamousGalaxyMetaEntry';
import { formatMorphology } from '../../../../../utils/format/formatMorphology';
import { formatDistance } from '../../../../../utils/format/formatDistance';
import { formatLookback } from '../../../../../utils/format/formatLookback';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../../components/InfoCard/compactChrome.module.css';
import local from './CompactCard.module.css';

export type CompactCardProps = {
  target: GalaxyInfo;
  /** A famous galaxy's sidecar entry, once it has landed. */
  curated?: FamousGalaxyMetaEntry;
};

function CompactCard({ target, curated }: CompactCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline" badge={target.sourceLabel}>
        {target.displayName}
      </CardRow>
      <div className={styles.cardLookbackLine}>
        Light left {formatLookback(target.lookbackGyr)} ago
      </div>
      <div className={styles.cardLookbackEra}>— {target.earthEra}</div>
      <div className={styles.cardDistLine}>
        {formatDistance(target.distanceMpc)} &middot;{' '}
        {curated?.type ? formatMorphology(curated.type) : target.galaxyType.description}
      </div>
    </div>
  );
}

export default CompactCard;
