/**
 * StarDetailCard — rich panel for a selected star, from any catalog.
 *
 * Star variant of the shared galaxy/structure/Milky-Way detail layout: the rows
 * every star shares (headline, distance) and then the one block its `detail`
 * carries. There is no thumbnail — a single star subtends no resolvable disk.
 * A star with nothing to add (the Sun, or a famous star whose sidecar has not
 * landed) renders its headline alone: one fail-soft path, no loading branch.
 *
 * The outer wrapper's tag + className stays stable across hover ↔ pin
 * transitions so InfoCard's single-wrapper layout keeps its DOM identity.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { deriveStarProperties } from '../../../utils/astro/deriveStarProperties';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatScalar } from '../../../utils/format/formatScalar';
import { starWikipediaTitle } from '../../../utils/format/starWikipediaTitle';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import WikipediaRow from '../WikipediaRow/WikipediaRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
import styles from '../cardChrome.module.css';
import local from './StarDetailCard.module.css';

export type StarDetailCardProps = {
  target: StarInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

/**
 * Survey photometry: the two catalogued numbers, then the physical estimates
 * they imply. An out-of-range colour is clamped by the relation, so its readings
 * get a leading '~' to signal "boundary value, not a fit". Magnitudes are Gaia
 * G band — hence the '(G)'.
 */
function photometryRows(detail: Extract<StarInfo['detail'], { kind: 'photometry' }>): ReactNode {
  const derived = deriveStarProperties(detail.absMag, detail.bpRp);
  const approx = derived.extrapolated ? '~' : '';
  return (
    <div className={styles.cardSection}>
      <CardRow
        label={<InfoTip {...TIPS.starApparentMag!}>Apparent mag (G)</InfoTip>}
        value={detail.apparentMag.toFixed(2)}
      />
      <CardRow
        label={<InfoTip {...TIPS.starAbsoluteMag!}>Absolute mag</InfoTip>}
        value={detail.absMag.toFixed(2)}
      />
      <CardRow
        label={<InfoTip {...TIPS.colourBpRp!}>Colour BP−RP</InfoTip>}
        value={detail.bpRp.toFixed(2)}
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
  );
}

/**
 * The curated sidecar's block. Same row order as the photometry block —
 * magnitudes → class → temperature → luminosity → radius, then the extras only a
 * curated entry has — so the two read as one family. Measured values, so no '~'.
 * Constellation heads the block as the star's "where", not part of that sequence.
 */
function curatedRows(meta: Extract<StarInfo['detail'], { kind: 'curated' }>['meta']): ReactNode {
  return (
    <>
      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.constellation!}>Constellation</InfoTip>}
          value={meta.constellation}
        />
        <CardRow
          label={<InfoTip {...TIPS.starApparentMag!}>Apparent mag (V)</InfoTip>}
          value={meta.magV.toFixed(2)}
        />
        <CardRow
          label={<InfoTip {...TIPS.starAbsoluteMag!}>Absolute mag</InfoTip>}
          value={meta.absMag.toFixed(2)}
        />
        <CardRow
          label={<InfoTip {...TIPS.spectralType!}>Spectral type</InfoTip>}
          value={meta.spectralType}
        />
        <CardRow
          label={<InfoTip {...TIPS.stellarTemperature!}>Temperature</InfoTip>}
          value={`${meta.temperatureK.toLocaleString()} K`}
        />
        {meta.luminositySolar != null && (
          <CardRow
            label={<InfoTip {...TIPS.stellarLuminosity!}>Luminosity</InfoTip>}
            value={`${meta.luminositySolar.toLocaleString()} L☉`}
          />
        )}
        <CardRow
          label={<InfoTip {...TIPS.stellarRadius!}>Radius</InfoTip>}
          value={`${meta.radiusSolar.toLocaleString()} R☉`}
        />
        {meta.massSolar != null && (
          <CardRow
            label={<InfoTip {...TIPS.stellarMass!}>Mass</InfoTip>}
            value={`${meta.massSolar.toLocaleString()} M☉`}
          />
        )}
        {meta.ageGyr != null && (
          <CardRow
            label={<InfoTip {...TIPS.stellarAge!}>Age</InfoTip>}
            value={`${meta.ageGyr.toLocaleString()} Gyr`}
          />
        )}
        {meta.variable && (
          <CardRow
            label={<InfoTip {...TIPS.variability!}>Variability</InfoTip>}
            value={`${meta.variable.type} (mag ${meta.variable.magRange[0]}–${meta.variable.magRange[1]})`}
          />
        )}
      </div>

      <div className={styles.cardSection}>
        <WikipediaRow title={starWikipediaTitle(meta.names[0]!)} />
      </div>

      <div className={styles.cardSection}>
        <DescriptionBlock text={meta.description} />
      </div>
    </>
  );
}

/**
 * An S-star's orbit. The pericentre prints both units on one row because the
 * Schwarzschild figure is legible only beside the AU it restates.
 */
function orbitRows(orbit: Extract<StarInfo['detail'], { kind: 'orbit' }>['orbit']): ReactNode {
  return (
    <div className={styles.cardSection}>
      <CardRow label="Orbits" value={orbit.focusLabel} />
      <CardRow label="Orbital period" value={`${formatScalar(orbit.periodYr)} yr`} />
      <CardRow label="Eccentricity" value={orbit.eccentricity.toFixed(3)} />
      <CardRow
        label="Pericentre"
        value={`${formatScalar(orbit.pericentreAu)} AU (${formatScalar(
          orbit.pericentreSchwarzschildRadii,
        )} Schwarzschild radii)`}
      />
      <CardRow label="Pericentre speed" value={`${formatScalar(orbit.pericentreSpeedKmS)} km/s`} />
    </div>
  );
}

function detailBlock(detail: StarInfo['detail']): ReactNode {
  if (detail.kind === 'photometry') return photometryRows(detail);
  if (detail.kind === 'curated') return curatedRows(detail.meta);
  if (detail.kind === 'orbit') return orbitRows(detail.orbit);
  return null;
}

function StarDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: StarDetailCardProps): ReactNode {
  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);
  const { detail } = target;
  const aliases = detail.kind === 'curated' ? detail.meta.names.slice(1) : [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Star"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow
        type="headline"
        badge={detail.kind === 'photometry' ? detail.spectralClass : undefined}
      >
        {target.displayName}
      </CardRow>
      {aliases.length > 0 && <div className={styles.headlineAlias}>{aliases.join(' · ')}</div>}

      {/* The Sun sits at the origin this distance is measured from, so its own
          row would read "0 m" — a fact about the frame, not about the star. */}
      {target.distancePc > 0 && (
        <div className={styles.cardSection}>
          <CardRow
            label={<InfoTip {...TIPS.starDistance!}>Distance</InfoTip>}
            value={formatDistance(target.distancePc * SCALE_UNITS.PC_TO_MPC)}
          />
        </div>
      )}

      {detailBlock(detail)}
    </div>
  );
}

export default StarDetailCard;
