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
import { deriveStarProperties } from '../../../utils/astro/deriveStarProperties';
import { formatScalar } from '../../../utils/format/formatScalar';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
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

  // Physical estimates from the two catalogued numbers (absMag + colour). An
  // out-of-range colour is clamped by the relation, so its readings get a
  // leading '~' to signal "boundary value, not a fit".
  const derived = deriveStarProperties(target.absMag, target.bpRp);
  const approx = derived.extrapolated ? '~' : '';

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
        <CardRow
          label={<InfoTip {...TIPS.starDistance!}>Distance</InfoTip>}
          value={`${Math.round(target.distancePc).toLocaleString()} pc`}
        />
        <CardRow
          label={<InfoTip {...TIPS.starAbsoluteMag!}>Absolute mag</InfoTip>}
          value={target.absMag.toFixed(2)}
        />
        <CardRow
          label={<InfoTip {...TIPS.starApparentMag!}>Apparent mag</InfoTip>}
          value={target.apparentMag.toFixed(2)}
        />
        <CardRow
          label={<InfoTip {...TIPS.colourBpRp!}>Colour BP−RP</InfoTip>}
          value={target.bpRp.toFixed(2)}
        />
        <CardRow
          label={<InfoTip {...TIPS.starDerived!}>Temperature</InfoTip>}
          value={`${approx}${formatScalar(derived.teffK)} K`}
        />
        <CardRow
          label={<InfoTip {...TIPS.starDerived!}>Luminosity</InfoTip>}
          value={`${approx}${formatScalar(derived.luminositySolar)} L☉`}
        />
        <CardRow
          label={<InfoTip {...TIPS.starDerived!}>Radius</InfoTip>}
          value={`${approx}${formatScalar(derived.radiusSolar)} R☉`}
        />
      </div>
    </div>
  );
}

export default FieldStarDetailCard;
