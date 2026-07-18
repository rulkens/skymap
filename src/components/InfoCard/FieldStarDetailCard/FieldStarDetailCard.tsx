/**
 * FieldStarDetailCard — rich panel for a picked survey star.
 *
 * Star variant of the shared galaxy/structure/Milky-Way detail layout: a
 * headline plus a section of label/value rows.  SKST v1 carries no per-star
 * identity, so the headline is the fixed 'Field star' and there is no
 * thumbnail to fetch (a single star subtends no resolvable disk) — the card is
 * pure derived numbers: distance in parsecs, absolute + apparent magnitude, and
 * BP−RP colour.  The rough spectral class (binned off that colour) rides the
 * headline badge — the star's at-a-glance kind — rather than a labelled row, so
 * it is shown once, the same way a galaxy shows its source and a structure its
 * category in the badge and never repeats it as a row.
 *
 * The outer wrapper's tag + className stays stable across hover ↔ pin
 * transitions so InfoCard's single-wrapper layout keeps its DOM identity.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { FieldStarInfo } from '../../../@types/engine/FieldStarInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import styles from '../cardChrome.module.css';
import local from './FieldStarDetailCard.module.css';

export type FieldStarDetailCardProps = {
  target: FieldStarInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function FieldStarDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: FieldStarDetailCardProps): ReactNode {
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
      </div>
    </div>
  );
}

export default FieldStarDetailCard;
