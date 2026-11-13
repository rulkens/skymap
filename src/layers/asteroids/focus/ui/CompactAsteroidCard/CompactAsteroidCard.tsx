/**
 * CompactAsteroidCard — slim hover preview for an asteroid: its name or number, class and V from
 * Earth, all read off the target, so the preview shows the instant it hovers.
 */

import type { ReactNode } from 'react';
import type { AsteroidInfo } from '../../../selection/@types/AsteroidInfo';
import { ASTEROID_CLASS_EYEBROWS } from '../../data/asteroidClassEyebrows';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../../components/InfoCard/compactChrome.module.css';
import local from './CompactAsteroidCard.module.css';

export type CompactAsteroidCardProps = {
  target: AsteroidInfo;
};

function CompactAsteroidCard({ target }: CompactAsteroidCardProps): ReactNode {
  const magnitude = target.now?.magnitude ?? null;
  const eyebrow = ASTEROID_CLASS_EYEBROWS[target.asteroidClass];
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
      <div className={styles.cardDistLine}>
        {magnitude === null ? eyebrow : `${eyebrow} · V ${magnitude.toFixed(1)}`}
      </div>
    </div>
  );
}

export default CompactAsteroidCard;
