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
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import WikipediaRow from '../WikipediaRow/WikipediaRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
import styles from '../cardChrome.module.css';
import local from './BodyDetailCard.module.css';

export type BodyDetailCardProps = {
  target: BodyInfo;
  pinned?: boolean;
  chrome?: boolean;
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
  pinned = false,
  chrome = true,
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

  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Body"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.label}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.label}</CardRow>

      {/*
        The physical radius resolved off the seed, then the live camera-distance
        row (time-dependent, off the pub; dropped when no distance is published,
        e.g. the initial null report), then — when a fact-sheet entry exists — the
        full planetary card. With no entry this stays the lean panel (radius
        alone). The distance / orbital-period rows relabel for a moon
        (`facts.parent`), which orbits its planet rather than the Sun.
      */}
      <div className={styles.cardSection}>
        {/* A mesh body's only radius is its bake hull, not a physical
                fact about the object — so it gets no radius row at all. */}
        {seed !== undefined && !isMeshBody(seed) && (
          <CardRow
            label={<InfoTip {...TIPS.bodyRadius!}>Radius</InfoTip>}
            value={formatRadiusM(seed.surface.datumRadiusM)}
          />
        )}
        {distanceMpc != null && <CardRow label="Distance" value={formatDistance(distanceMpc)} />}
        {facts?.mass && (
          <CardRow label={<InfoTip {...TIPS.bodyMass!}>Mass</InfoTip>} value={facts.mass} />
        )}
        {facts?.gravity && (
          <CardRow
            label={<InfoTip {...TIPS.bodyGravity!}>Gravity</InfoTip>}
            value={facts.gravity}
          />
        )}
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
