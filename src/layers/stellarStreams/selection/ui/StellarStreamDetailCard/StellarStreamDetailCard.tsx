/**
 * StellarStreamDetailCard — the panel for a selected stream: what kind of debris it is, its size,
 * distance and width, its measured metallicity (only when measured), how many particles draw it,
 * and where the track comes from. Every value is the meta row, so the card shows before the
 * particles load.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { CardLayout } from '../../../../../@types/components/infoCard/CardLayout';
import type { StellarStreamTarget } from '../../@types/StellarStreamTarget';
import { STELLAR_STREAM_SOURCE_FACTS } from '../../data/stellarStreamSourceFacts.constants';
import { formatKpcRange } from '../../utils/formatKpcRange';
import CardHeader from '../../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import styles from '../../../../../components/InfoCard/cardChrome.module.css';
import local from './StellarStreamDetailCard.module.css';

export type StellarStreamDetailCardProps = {
  target: StellarStreamTarget;
  isPinned?: boolean;
  layout?: CardLayout;
  onFocus?: () => void;
  onClose?: () => void;
};

function StellarStreamDetailCard({
  target,
  isPinned = false,
  layout = 'panel',
  onFocus,
  onClose,
}: StellarStreamDetailCardProps): ReactNode {
  const facts = STELLAR_STREAM_SOURCE_FACTS[target.source];
  const name = target.names[0]!;
  return (
    <div
      className={cx(local.root, isPinned && styles.pinned, layout === 'phone' && styles.chromeless)}
      role="status"
      aria-live="polite"
    >
      <CardHeader
        layout={layout}
        eyebrow={facts.kind}
        title={name}
        onFocus={isPinned ? onFocus : undefined}
        focusAriaLabel={`Focus camera on ${name}`}
        onClose={isPinned ? onClose : undefined}
      />
      <div className={styles.cardSection}>
        <CardRow label={facts.sizeLabel} value={`${Math.round(target.lengthKpc)} kpc`} />
        <CardRow label="Distance" value={formatKpcRange(target.distanceKpc)} />
        <CardRow label="Width" value={target.widthDeg === null ? '—' : `${target.widthDeg}°`} />
        {target.feh !== null && (
          <CardRow
            label="Metallicity"
            value={`[Fe/H] ${target.feh.toFixed(2).replace('-', '\u2212')} (${target.fehRef})`}
          />
        )}
        <CardRow label="Particles drawn" value={target.particleCount.toLocaleString()} />
      </div>
      <div className={styles.cardSection}>
        <CardRow label="Source" value={facts.sourceLine(target.reference)} />
        <CardRow label="Licence" value={facts.licence} />
      </div>
    </div>
  );
}

export default StellarStreamDetailCard;
