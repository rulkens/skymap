/**
 * BodyDetailCard — rich panel for a focused scene body (Earth, a planet/moon, a
 * mesh body). Stars have their own card (`StarDetailCard`).
 *
 * The engine hands React a lean `BodyInfo` (id + label + position) so a body is
 * always immediately selectable. The card reads the rest from the compiled-in
 * `BODY_FACTS` table (a tiny fixed set, no fetch), keyed by the same `id`: with
 * an entry it shows the full planetary fact sheet (radius first, then mass,
 * gravity, day, year, …); without one it falls back to the lean panel (radius
 * alone).
 *
 * The **camera distance** is time-dependent (it swings as the body orbits), so it
 * is NOT baked into the identity `BodyInfo`; it arrives as the `distanceMpc`
 * prop, which `BodyDetailCardContainer` reads live off the throttled
 * `engineBodyDistanceReported` pub. This card stays presentational: it renders
 * whatever distance it is handed and never derives or fetches it (the
 * store-boundary rule forbids a card reaching into the engine snapshot).
 *
 * Optional fields drop their row entirely when absent rather than showing a
 * blank — the same absent-row pattern the galaxy/structure cards use.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatRadiusM } from '../../../utils/format/formatRadiusM';
import { BODY_FACTS } from '../../../data/bodies/bodyFacts.generated';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { cardShotUrl } from '../../../utils/palette/cardShotUrl';
import { SHOT_CARD_IDS } from '../../../data/palette/shotCardIds';
import { BODY_FOCUS_PREFIX } from '../../../services/url/bodyFocusId';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import type { CardRowProps } from '../CardRow/CardRow';
import Thumbnail from '../Thumbnail/Thumbnail';
import WikipediaRow from '../WikipediaRow/WikipediaRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
import styles from '../cardChrome.module.css';
import local from './BodyDetailCard.module.css';

export type BodyDetailCardProps = {
  target: BodyInfo;
  isPinned?: boolean;
  hasChrome?: boolean;
  /**
   * Live camera→body distance in Mpc off the throttled time pub, or null when no
   * distance is published. Rendered as a row on the non-star body branch only.
   */
  distanceMpc?: number | null;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function BodyDetailCard({
  target,
  isPinned = false,
  hasChrome = true,
  distanceMpc = null,
  onFocus,
  onClose,
}: BodyDetailCardProps): ReactNode {
  // A planet/moon's curated fact sheet — compiled in, no fetch. Absent ⇒ the
  // lean panel (radius alone).
  const facts = BODY_FACTS[target.id];
  // The card is handed identity only, so the seed is resolved here: its arm
  // decides whether a radius row means anything at all. A miss just drops the
  // row (the absent-row pattern below), not a render-time throw.
  const seed = SCENE_BODIES.find((b) => b.id === target.id);
  const shotId = `${BODY_FOCUS_PREFIX}${target.id}`;
  const hasShot = SHOT_CARD_IDS.has(shotId);

  // The lead rows — the "where / how big" facts — sit beside the card shot as
  // summary lines (the galaxy card's layout, one line per 20 px of the 80 px
  // image), or, for a body with no shot, head the row list as CardRows.
  // A mesh body's only radius is its bake hull, not a physical fact about the
  // object, so it gets no radius row; the live camera distance is dropped
  // until one is published (the initial null report).
  const leadRows: Extract<CardRowProps, { value: ReactNode }>[] = [];
  if (seed !== undefined && !isMeshBody(seed)) {
    leadRows.push({
      label: <InfoTip {...TIPS.bodyRadius!}>Radius</InfoTip>,
      value: formatRadiusM(seed.surface.datumRadiusM),
    });
  }
  if (distanceMpc != null) leadRows.push({ label: 'Distance', value: formatDistance(distanceMpc) });
  if (facts?.mass) {
    leadRows.push({ label: <InfoTip {...TIPS.bodyMass!}>Mass</InfoTip>, value: facts.mass });
  }
  if (facts?.gravity) {
    leadRows.push({
      label: <InfoTip {...TIPS.bodyGravity!}>Gravity</InfoTip>,
      value: facts.gravity,
    });
  }

  const outerClass = cx(local.root, isPinned && styles.pinned, !hasChrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Body"
        onFocus={isPinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.label}`}
        onClose={isPinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.label}</CardRow>

      {hasShot && (
        <div className={cx(styles.cardSection, styles.cardTopRow)}>
          <Thumbnail url={cardShotUrl(shotId)} alt={`${target.label} thumbnail`} />
          <div className={styles.cardSummary}>
            {leadRows.map((row, i) => (
              <div key={i} className={styles.cardDistLine}>
                <span>{row.label}</span> {row.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        The lead rows, then — when a fact-sheet entry exists — the full planetary
        card. With no entry this stays the lean panel (radius alone). The
        distance / orbital-period rows relabel for a moon (`facts.parent`), which
        orbits its planet rather than the Sun.
      */}
      {(!hasShot || facts) && (
        <div className={styles.cardSection}>
          {!hasShot && leadRows.map((row, i) => <CardRow key={i} {...row} />)}
          {facts?.dayLength && (
            <CardRow
              label={<InfoTip {...TIPS.bodyDayLength!}>Day length</InfoTip>}
              value={facts.dayLength}
            />
          )}
          {facts?.yearLength && (
            <CardRow
              label={
                <InfoTip {...TIPS.bodyYearLength!}>
                  {facts.parent ? 'Orbital period' : 'Year length'}
                </InfoTip>
              }
              value={facts.yearLength}
            />
          )}
          {facts?.distance && (
            <CardRow
              label={
                <InfoTip {...TIPS.bodyDistance!}>
                  {facts.parent ? `Distance from ${facts.parent}` : 'Distance from Sun'}
                </InfoTip>
              }
              value={facts.distance}
            />
          )}
          {facts?.meanTemp && (
            <CardRow
              label={<InfoTip {...TIPS.bodyMeanTemp!}>Mean temperature</InfoTip>}
              value={facts.meanTemp}
            />
          )}
          {facts?.moons && (
            <CardRow label={<InfoTip {...TIPS.bodyMoons!}>Moons</InfoTip>} value={facts.moons} />
          )}
          {facts?.axialTilt && (
            <CardRow
              label={<InfoTip {...TIPS.bodyAxialTilt!}>Axial tilt</InfoTip>}
              value={facts.axialTilt}
            />
          )}
          {facts?.atmosphere && (
            <CardRow
              label={<InfoTip {...TIPS.bodyAtmosphere!}>Atmosphere</InfoTip>}
              value={facts.atmosphere}
            />
          )}
        </div>
      )}
      {facts && (
        <div className={styles.cardSection}>
          <WikipediaRow title={facts.wikiTitle} />
        </div>
      )}
      {facts?.description && (
        <div className={styles.cardSection}>
          <DescriptionBlock text={facts.description} />
        </div>
      )}
    </div>
  );
}

export default BodyDetailCard;
