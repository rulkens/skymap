/**
 * AsteroidDetailCard — rich panel for a selected asteroid: its orbit as MPC publishes it, then where
 * it is and how bright it looks from Earth at selection. Outside 1900–2100 the "now" section is gone
 * rather than stale: two-body elements from one epoch are not trusted that far out.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { AsteroidInfo } from '../../../selection/@types/AsteroidInfo';
import type { CardLayout } from '../../../../../@types/components/infoCard/CardLayout';
import { ASTEROID_CLASS_EYEBROWS } from '../../data/asteroidClassEyebrows';
import { formatAu } from '../../utils/formatAu';
import { julianDaysToUnixMs } from '../../../../../utils/time/julianDaysToUnixMs';
import CardHeader from '../../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../../components/InfoCard/cardChrome.module.css';
import local from './AsteroidDetailCard.module.css';

export type AsteroidDetailCardProps = {
  target: AsteroidInfo;
  isPinned?: boolean;
  layout?: CardLayout;
  onFocus?: () => void;
  onClose?: () => void;
};

function AsteroidDetailCard({
  target,
  isPinned = false,
  layout = 'panel',
  onFocus,
  onClose,
}: AsteroidDetailCardProps): ReactNode {
  const outerClass = cx(
    local.root,
    isPinned && styles.pinned,
    layout === 'phone' && styles.chromeless,
  );
  const h = target.absoluteMagnitude;
  const now = target.now;
  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        layout={layout}
        eyebrow={ASTEROID_CLASS_EYEBROWS[target.asteroidClass]}
        title={target.label}
        onFocus={isPinned ? onFocus : undefined}
        focusAriaLabel={`Follow ${target.label} with the camera`}
        onClose={isPinned ? onClose : undefined}
      />
      <div className={styles.cardSection}>
        <CardRow label="Minor planet number" value={String(target.number)} />
        <CardRow label="Semi-major axis" value={formatAu(target.semiMajorAu)} />
        <CardRow label="Eccentricity" value={target.eccentricity.toFixed(3)} />
        <CardRow label="Inclination" value={`${target.inclinationDeg.toFixed(1)}°`} />
        <CardRow label="Orbit period" value={`${target.periodYears.toFixed(2)} years`} />
        <CardRow
          label="Absolute magnitude"
          value={h === null ? 'H unknown' : `H ${h.toFixed(2)}`}
        />
      </div>
      {now !== null && (
        <div className={styles.cardSection}>
          <CardRow label="From the Sun" value={formatAu(now.sunDistanceAu)} />
          <CardRow label="From Earth" value={formatAu(now.earthDistanceAu)} />
          {now.magnitude !== null && (
            <CardRow label="Brightness from Earth" value={`V ${now.magnitude.toFixed(1)}`} />
          )}
        </div>
      )}
      <div className={styles.cardSection}>
        <CardRow
          label="Orbit epoch"
          value={new Date(julianDaysToUnixMs(target.epochJd)).toISOString().slice(0, 10)}
        />
        <CardRow label="Source" value="Minor Planet Center" />
      </div>
    </div>
  );
}

export default AsteroidDetailCard;
