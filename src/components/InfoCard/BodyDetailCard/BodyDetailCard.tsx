/**
 * BodyDetailCard — rich panel for a focused scene body (a famous star, Earth, a
 * planet/moon, an S-star).
 *
 * The engine hands React a lean `BodyInfo` (id + label + position + radius) so a
 * body is always immediately selectable.  The card then branches on the body's
 * kind, keyed by `FAMOUS_STAR_IDS.has(target.id)`:
 *
 *   - A famous star gets the rich stellar panel: its narrative/physical rows live
 *     in the async `famous_stars_meta.json` sidecar, handed in as the
 *     `famousStarsMeta` prop and looked up by `id`.  A star with no meta entry
 *     (before the sidecar's slot settles, or a dev clone with no sidecar)
 *     renders the headline alone — one fail-soft path covering both cases, which
 *     is why the card needs no separate "loaded yet?" flag to branch on.
 *     Its physical rows follow the shared star-card order (distance →
 *     magnitudes → class → temperature → luminosity → radius → famous extras) so
 *     the famous and field-star cards read as one family.
 *   - Any other body (Earth, a planet, a moon) reads its facts from the
 *     compiled-in `BODY_FACTS` table (a tiny fixed set — no fetch, unlike the
 *     star sidecar), keyed by the same `id`.  With an entry it shows the full
 *     planetary fact sheet (radius first, then mass, gravity, day, year, …);
 *     without one it falls back to the lean panel (radius alone).  A body
 *     carrying orbital elements (an S-star) adds `BodyInfo.orbit`'s block after
 *     that panel — synchronous, so it needs no loading branch of its own.
 *
 * The non-star body's **camera distance** is time-dependent (it swings as the
 * body orbits), so it is NOT baked into the identity `BodyInfo`; it arrives as
 * the `distanceMpc` prop, which `BodyDetailCardContainer` reads live off the
 * throttled `engineBodyDistanceReported` pub — as it also reads the star
 * sidecar. This card stays presentational: it renders whatever distance and
 * metadata it is handed and never derives or fetches either (the store-boundary
 * rule forbids a card reaching into the engine snapshot).
 *
 * Both branches end with a "Learn more" Wikipedia link: the body's explicit
 * `wikiTitle`, or a famous star's primary name (via `starWikipediaTitle`, which
 * overrides only the disambiguation-collision handful).
 *
 * Optional fields drop their row entirely when absent rather than showing a
 * blank — the same absent-row pattern the galaxy/structure cards use.  Aliases
 * trail the primary name as a muted "also known as" line (names.slice(1),
 * mirroring GalaxyDetailCard's idiom).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FamousStarMetaEntry } from '../../../@types/loading/FamousStarMetaEntry';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatScalar } from '../../../utils/format/formatScalar';
import { FAMOUS_STAR_IDS } from '../../../data/bodies/famousStarsIndex';
import { BODY_FACTS } from '../../../data/bodies/bodyFacts.generated';
import { starWikipediaTitle } from '../../../utils/format/starWikipediaTitle';
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
  /**
   * Parsed `famous_stars_meta.json` entries, empty until the sidecar's asset slot
   * settles (and after a failed fetch). Consulted only on the famous-star branch.
   *
   * Required rather than defaulted: `BodyDetailCardContainer` is the only render
   * site and always supplies it, so a default would exist purely to let a future
   * call site omit it and silently render every star's headline alone.
   */
  famousStarsMeta: readonly FamousStarMetaEntry[];
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function BodyDetailCard({
  target,
  pinned = false,
  chrome = true,
  distanceMpc = null,
  famousStarsMeta,
  onFocus,
  onClose,
}: BodyDetailCardProps): ReactNode {
  const isFamousStar = FAMOUS_STAR_IDS.has(target.id);
  const entry = isFamousStar
    ? famousStarsMeta.find((m: FamousStarMetaEntry) => m.id === target.id)
    : undefined;
  // A planet/moon's curated fact sheet — compiled in, no fetch. Absent ⇒ the
  // lean panel (radius alone). Never consulted on the famous-star branch.
  const facts = isFamousStar ? undefined : BODY_FACTS[target.id];

  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);
  const aliases = entry ? entry.names.slice(1) : [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow={isFamousStar ? 'Star' : 'Body'}
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.label}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.label}</CardRow>
      {aliases.length > 0 && <div className={styles.headlineAlias}>{aliases.join(' · ')}</div>}

      {/*
        Non-star body (Earth, a planet, a moon): the physical radius straight off
        the BodyInfo, then the live camera-distance row (time-dependent, off the
        pub; dropped when no distance is published, e.g. the initial null
        report), then — when a fact-sheet entry exists — the full planetary
        card.  With no entry this stays the lean panel (radius alone).  The
        distance / orbital-period rows relabel for a moon (`facts.parent`), which
        orbits its planet rather than the Sun.
      */}
      {!isFamousStar && (
        <>
          <div className={styles.cardSection}>
            <CardRow
              label={<InfoTip {...TIPS.bodyRadius!}>Radius</InfoTip>}
              value={`${target.radiusKm.toLocaleString()} km`}
            />
            {distanceMpc != null && (
              <CardRow label="Distance" value={formatDistance(distanceMpc)} />
            )}
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
          {/*
            Orbital block — present only for a body carrying elements (the
            S-stars today), absent for Earth, the planets and the moons, whose
            orbits are the fact sheet's business.  The pericentre prints both
            units on one row because the Schwarzschild figure is legible only
            beside the AU it restates.
          */}
          {target.orbit && (
            <div className={styles.cardSection}>
              <CardRow label="Orbits" value={target.orbit.focusLabel} />
              <CardRow label="Orbital period" value={`${formatScalar(target.orbit.periodYr)} yr`} />
              <CardRow label="Eccentricity" value={target.orbit.eccentricity.toFixed(3)} />
              <CardRow
                label="Pericentre"
                value={`${formatScalar(target.orbit.pericentreAu)} AU (${formatScalar(
                  target.orbit.pericentreSchwarzschildRadii,
                )} Schwarzschild radii)`}
              />
              <CardRow
                label="Pericentre speed"
                value={`${formatScalar(target.orbit.pericentreSpeedKmS)} km/s`}
              />
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
        </>
      )}

      {/*
        Famous star with no entry yet (fetch in flight, or a deployment without
        the sidecar): headline only — the fail-soft path.  The properties +
        description fill in the instant the sidecar resolves.
      */}
      {entry && (
        <>
          {/*
            Shared star-card row order (harmonized with FieldStarDetailCard):
            distance → apparent mag → absolute mag → class (spectral type) →
            temperature → luminosity → radius → famous-only extras (mass, age,
            variability).  Constellation heads the block as the star's "where",
            not part of that physical sequence.  Measured famous values, so no
            '~' affordance — unlike the field star's derived estimates.
          */}
          <div className={styles.cardSection}>
            <CardRow
              label={<InfoTip {...TIPS.constellation!}>Constellation</InfoTip>}
              value={entry.constellation}
            />
            <CardRow
              label={<InfoTip {...TIPS.starDistance!}>Distance</InfoTip>}
              value={formatDistance(entry.distancePc * SCALE_UNITS.PC_TO_MPC)}
            />
            <CardRow
              label={<InfoTip {...TIPS.starApparentMag!}>Apparent mag (V)</InfoTip>}
              value={entry.magV.toFixed(2)}
            />
            <CardRow
              label={<InfoTip {...TIPS.starAbsoluteMag!}>Absolute mag</InfoTip>}
              value={entry.absMag.toFixed(2)}
            />
            <CardRow
              label={<InfoTip {...TIPS.spectralType!}>Spectral type</InfoTip>}
              value={entry.spectralType}
            />
            <CardRow
              label={<InfoTip {...TIPS.stellarTemperature!}>Temperature</InfoTip>}
              value={`${entry.temperatureK.toLocaleString()} K`}
            />
            {entry.luminositySolar != null && (
              <CardRow
                label={<InfoTip {...TIPS.stellarLuminosity!}>Luminosity</InfoTip>}
                value={`${entry.luminositySolar.toLocaleString()} L☉`}
              />
            )}
            <CardRow
              label={<InfoTip {...TIPS.stellarRadius!}>Radius</InfoTip>}
              value={`${entry.radiusSolar.toLocaleString()} R☉`}
            />
            {entry.massSolar != null && (
              <CardRow
                label={<InfoTip {...TIPS.stellarMass!}>Mass</InfoTip>}
                value={`${entry.massSolar.toLocaleString()} M☉`}
              />
            )}
            {entry.ageGyr != null && (
              <CardRow
                label={<InfoTip {...TIPS.stellarAge!}>Age</InfoTip>}
                value={`${entry.ageGyr.toLocaleString()} Gyr`}
              />
            )}
            {entry.variable && (
              <CardRow
                label={<InfoTip {...TIPS.variability!}>Variability</InfoTip>}
                value={`${entry.variable.type} (mag ${entry.variable.magRange[0]}–${entry.variable.magRange[1]})`}
              />
            )}
          </div>

          <div className={styles.cardSection}>
            <WikipediaRow title={starWikipediaTitle(entry.names[0]!)} />
          </div>

          <div className={styles.cardSection}>
            <DescriptionBlock text={entry.description} />
          </div>
        </>
      )}
    </div>
  );
}

export default BodyDetailCard;
