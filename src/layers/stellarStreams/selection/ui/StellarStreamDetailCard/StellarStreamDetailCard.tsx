/**
 * StellarStreamDetailCard — the panel for a selected stream: what kind of debris it is, its size
 * and distance, its width, measured metallicity and published stellar mass where there are such, and its
 * description with a Wikipedia link where it has an article. Every value is the meta row, so the card shows before the particles load.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { CardLayout } from '../../../../../@types/components/infoCard/CardLayout';
import type { StellarStreamTarget } from '../../@types/StellarStreamTarget';
import { STELLAR_STREAM_SOURCE_FACTS } from '../../data/stellarStreamSourceFacts.constants';
import { formatKpcRange } from '../../utils/formatKpcRange';
import { formatScientific } from '../../../../../utils/format/formatScientific';
import CardHeader from '../../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../../components/InfoCard/CardRow/CardRow';
import DescriptionBlock from '../../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import WikipediaRow from '../../../../../components/InfoCard/WikipediaRow/WikipediaRow';
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
        {target.widthDeg !== null && <CardRow label="Width" value={`${target.widthDeg}°`} />}
        {target.metallicity && (
          <CardRow
            label="Metallicity"
            value={`[Fe/H] ${target.metallicity.feh.toFixed(2).replace('-', '\u2212')} (${target.metallicity.ref})`}
          />
        )}
        {target.stellarMass && (
          <CardRow
            label="Stellar mass"
            value={`${target.stellarMass.partial ? '≥ ' : ''}${formatScientific(target.stellarMass.massMsun)} M☉ (${target.stellarMass.ref})`}
          />
        )}
      </div>
      {target.wikipediaTitle && (
        <div className={styles.cardSection}>
          <WikipediaRow title={target.wikipediaTitle} />
        </div>
      )}
      {target.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={target.description} />
        </div>
      )}
    </div>
  );
}

export default StellarStreamDetailCard;
