/**
 * StarDetailCard — rich panel for a selected star, from any catalog.
 *
 * Star variant of the shared galaxy/structure/Milky-Way detail layout: the rows
 * every star shares (headline, distance) and then the one block its `detail`
 * carries. A star that has a featured card shows it, with the lead rows beside
 * it as summary lines — the body card's layout. A star with nothing to add (a
 * seeded star whose sidecar has not landed) renders its headline alone: one
 * fail-soft path, no loading branch, and no image over an empty column.
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
import { cardShotUrl } from '../../../utils/palette/cardShotUrl';
import { SHOT_CARD_IDS } from '../../../data/palette/shotCardIds';
import { STAR_FOCUS_PREFIX } from '../../../services/url/starFocusId';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import type { CardRowProps } from '../CardRow/CardRow';
import Thumbnail from '../Thumbnail/Thumbnail';
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
 * `leadRows` (the star's "where / how bright") heads the block, or is empty
 * because the shot's summary column already carries it.
 */
function curatedRows(
  meta: Extract<StarInfo['detail'], { kind: 'curated' }>['meta'],
  leadRows: readonly Extract<CardRowProps, { value: ReactNode }>[],
): ReactNode {
  return (
    <>
      <div className={styles.cardSection}>
        {leadRows.map((row, i) => (
          <CardRow key={i} {...row} />
        ))}
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

function detailBlock(
  detail: StarInfo['detail'],
  leadRows: readonly Extract<CardRowProps, { value: ReactNode }>[],
): ReactNode {
  if (detail.kind === 'photometry') return photometryRows(detail);
  if (detail.kind === 'curated') return curatedRows(detail.meta, leadRows);
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

  // A card shot is keyed by the star's own focus id, so a seeded star finds it
  // without a lookup table. Gated on a curated entry: with no sidecar row there
  // is nothing to put beside the image, and an image over an empty summary
  // column is worse than the headline-only fallback (a Gaia star has no id at
  // all, so it never has a shot).
  const shotId = target.id === null ? null : `${STAR_FOCUS_PREFIX}${target.id}`;
  const hasShot = detail.kind === 'curated' && shotId !== null && SHOT_CARD_IDS.has(shotId);

  // The "where / how bright" rows: beside the shot as summary lines, or heading
  // the curated block as CardRows. Distance is the star's own row for every
  // other detail kind, below.
  const leadRows: Extract<CardRowProps, { value: ReactNode }>[] = [];
  if (detail.kind === 'curated') {
    leadRows.push({
      label: <InfoTip {...TIPS.constellation!}>Constellation</InfoTip>,
      value: detail.meta.constellation,
    });
    if (target.distancePc > 0) {
      leadRows.push({
        label: <InfoTip {...TIPS.starDistance!}>Distance</InfoTip>,
        value: formatDistance(target.distancePc * SCALE_UNITS.PC_TO_MPC),
      });
    }
    leadRows.push(
      {
        label: <InfoTip {...TIPS.starApparentMag!}>Apparent mag (V)</InfoTip>,
        value: detail.meta.magV.toFixed(2),
      },
      {
        label: <InfoTip {...TIPS.starAbsoluteMag!}>Absolute mag</InfoTip>,
        value: detail.meta.absMag.toFixed(2),
      },
    );
  }

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

      {hasShot && (
        <div className={cx(styles.cardSection, styles.cardTopRow)}>
          <Thumbnail url={cardShotUrl(shotId)} alt={`${target.displayName} thumbnail`} />
          <div className={styles.cardSummary}>
            {leadRows.map((row, i) => (
              <div key={i} className={styles.cardDistLine}>
                <span>{row.label}</span> {row.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The Sun sits at the origin this distance is measured from, so its own
          row would read "0 m" — a fact about the frame, not about the star. */}
      {detail.kind !== 'curated' && target.distancePc > 0 && (
        <div className={styles.cardSection}>
          <CardRow
            label={<InfoTip {...TIPS.starDistance!}>Distance</InfoTip>}
            value={formatDistance(target.distancePc * SCALE_UNITS.PC_TO_MPC)}
          />
        </div>
      )}

      {detailBlock(detail, hasShot ? [] : leadRows)}
    </div>
  );
}

export default StarDetailCard;
