/** CompactStellarStreamCard — the hover preview: a stream's name, kind and distance range. */

import type { ReactNode } from 'react';
import type { StellarStreamTarget } from '../../@types/StellarStreamTarget';
import { STELLAR_STREAM_SOURCE_FACTS } from '../../data/stellarStreamSourceFacts.constants';
import { formatKpcRange } from '../../utils/formatKpcRange';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../../components/InfoCard/compactChrome.module.css';
import local from './CompactStellarStreamCard.module.css';

export type CompactStellarStreamCardProps = {
  target: StellarStreamTarget;
};

function CompactStellarStreamCard({ target }: CompactStellarStreamCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.names[0]}</CardRow>
      <div className={styles.cardDistLine}>
        {STELLAR_STREAM_SOURCE_FACTS[target.source].kind} &middot;{' '}
        {formatKpcRange(target.distanceKpc)}
      </div>
    </div>
  );
}

export default CompactStellarStreamCard;
