/**
 * CompactSatelliteCard — slim hover preview for a satellite: its name and altitude, both read off
 * the target, so the preview shows the instant it hovers.
 */

import type { ReactNode } from 'react';
import type { SatelliteInfo } from '../../../../@types/engine/SatelliteInfo';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../components/InfoCard/compactChrome.module.css';
import local from './CompactSatelliteCard.module.css';

export type CompactSatelliteCardProps = {
  target: SatelliteInfo;
};

function CompactSatelliteCard({ target }: CompactSatelliteCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
      <div className={styles.cardDistLine}>
        {`${Math.round(target.altitudeKm).toLocaleString()} km up`}
      </div>
    </div>
  );
}

export default CompactSatelliteCard;
