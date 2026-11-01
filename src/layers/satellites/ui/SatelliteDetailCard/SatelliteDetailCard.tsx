/**
 * SatelliteDetailCard — rich panel for a selected satellite: what it is, its catalog numbers, and
 * the orbit CelesTrak published, with the date that orbit was fitted (positions drift from it by
 * kilometres a day). Altitude is read at selection; the rest is the catalog row.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { SatelliteInfo } from '../../../../@types/engine/SatelliteInfo';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';
import type { CardLayout } from '../../../../@types/components/infoCard/CardLayout';
import { SATELLITE_CLASS_EYEBROWS } from '../../../../data/satellites/satelliteClassEyebrows';
import { formatSimClock } from '../../../../utils/time/formatSimClock';
import CardHeader from '../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../components/InfoCard/cardChrome.module.css';
import local from './SatelliteDetailCard.module.css';

export type SatelliteDetailCardProps = {
  target: SatelliteInfo;
  isPinned?: boolean;
  layout?: CardLayout;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function SatelliteDetailCard({
  target,
  isPinned = false,
  layout = 'panel',
  onFocus,
  onClose,
}: SatelliteDetailCardProps): ReactNode {
  const outerClass = cx(
    local.root,
    isPinned && styles.pinned,
    layout === 'phone' && styles.chromeless,
  );
  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        layout={layout}
        eyebrow={SATELLITE_CLASS_EYEBROWS[target.satelliteClass]}
        title={target.label}
        onFocus={isPinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Follow ${target.label} with the camera`}
        onClose={isPinned ? onClose : undefined}
      />
      <div className={styles.cardSection}>
        <CardRow label="NORAD number" value={String(target.noradId)} />
        {target.cosparId !== '' && (
          <CardRow label="International designator" value={target.cosparId} />
        )}
        <CardRow label="Altitude" value={`${Math.round(target.altitudeKm).toLocaleString()} km`} />
        <CardRow label="Orbit period" value={`${target.periodMin.toFixed(1)} min`} />
        <CardRow label="Inclination" value={`${target.inclinationDeg.toFixed(1)}°`} />
      </div>
      <div className={styles.cardSection}>
        <CardRow label="Orbit fitted" value={formatSimClock(new Date(target.epochMs))} />
        <CardRow label="Source" value="CelesTrak" />
      </div>
    </div>
  );
}

export default SatelliteDetailCard;
