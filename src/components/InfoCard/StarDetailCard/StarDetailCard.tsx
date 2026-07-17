/**
 * StarDetailCard — rich panel for a picked survey star.
 *
 * Star variant of the shared galaxy/structure/Milky-Way detail layout: a
 * headline plus a section of label/value rows.  SKST v1 carries no per-star
 * identity, so the headline is the fixed 'Field star' and there is no
 * thumbnail to fetch (a single star subtends no resolvable disk) — the card is
 * pure derived numbers: distance in parsecs, absolute + apparent magnitude,
 * BP−RP colour, and the rough spectral class binned off that colour.
 *
 * The outer wrapper's tag + className stays stable across hover ↔ pin
 * transitions so InfoCard's single-wrapper layout keeps its DOM identity.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import styles from '../cardChrome.module.css';
import local from './StarDetailCard.module.css';

export type StarDetailCardProps = {
  target: StarInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function StarDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: StarDetailCardProps): ReactNode {
  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Star"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline" badge={target.spectralClass}>
        {target.displayName}
      </CardRow>

      <div className={styles.cardSection}>
        <CardRow label="Distance" value={`${Math.round(target.distancePc).toLocaleString()} pc`} />
        <CardRow label="Absolute mag" value={target.absMag.toFixed(2)} />
        <CardRow label="Apparent mag" value={target.apparentMag.toFixed(2)} />
        <CardRow label="Colour BP−RP" value={target.bpRp.toFixed(2)} />
        <CardRow label="Spectral class" value={target.spectralClass} />
      </div>
    </div>
  );
}

export default StarDetailCard;
