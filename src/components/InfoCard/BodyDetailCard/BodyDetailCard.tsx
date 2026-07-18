/**
 * BodyDetailCard — rich panel for a focused scene body (a famous star, Earth, or
 * a planet).
 *
 * The engine hands React a lean `BodyInfo` (id + label + position + radius) so a
 * body is always immediately selectable.  The card then branches on the body's
 * kind, keyed by `FAMOUS_STAR_IDS.has(target.id)`:
 *
 *   - A famous star gets the rich stellar panel: its narrative/physical rows live
 *     in the async `famous_stars_meta.json` sidecar, looked up by `id` in
 *     `useFamousStarsMeta()` and filled in once the fetch settles.  A star with no
 *     meta entry (before the fetch settles, or a dev clone with no sidecar)
 *     renders the headline alone — the fail-soft path the hook's `ready` contract
 *     guarantees.
 *   - Any other body (Earth, a planet, a moon) has no stellar sidecar, so it
 *     renders a lean panel: the headline plus its physical radius (km) straight
 *     off the `BodyInfo`, no fetch dependency.
 *
 * Optional physical fields (mass, luminosity, age, variability) drop their row
 * entirely when absent rather than showing a blank — the same absent-row pattern
 * the galaxy/structure cards use.  Aliases trail the primary name as a muted
 * "also known as" line (names.slice(1), mirroring GalaxyDetailCard's idiom).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { formatDistance } from '../../../utils/format/formatDistance';
import { FAMOUS_STAR_IDS } from '../../../data/bodies/famousStarsIndex';
import { useFamousStarsMeta } from '../../../hooks/useFamousStarsMeta';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import styles from '../cardChrome.module.css';
import local from './BodyDetailCard.module.css';

export type BodyDetailCardProps = {
  target: BodyInfo;
  pinned?: boolean;
  chrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

function BodyDetailCard({
  target,
  pinned = false,
  chrome = true,
  onFocus,
  onClose,
}: BodyDetailCardProps): ReactNode {
  // Rules-of-hooks forbid a conditional hook call, so `useFamousStarsMeta`
  // always runs; we gate its *consumption* on the star branch — a non-star body
  // never reads the stellar sidecar.
  const { famousStarsMeta } = useFamousStarsMeta();
  const isFamousStar = FAMOUS_STAR_IDS.has(target.id);
  const entry = isFamousStar ? famousStarsMeta.find((m) => m.id === target.id) : undefined;

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
        the BodyInfo — no stellar sidecar, so this is all the card can show.
      */}
      {!isFamousStar && (
        <div className={styles.cardSection}>
          <CardRow label="Radius" value={`${target.radiusKm.toLocaleString()} km`} />
        </div>
      )}

      {/*
        Famous star with no entry yet (fetch in flight, or a deployment without
        the sidecar): headline only — the fail-soft path.  The properties +
        description fill in the instant the sidecar resolves.
      */}
      {entry && (
        <>
          <div className={styles.cardSection}>
            <CardRow label="Constellation" value={entry.constellation} />
            <CardRow label="Spectral type" value={entry.spectralType} />
            <CardRow
              label="Distance"
              value={formatDistance(entry.distancePc * SCALE_UNITS.PC_TO_MPC)}
            />
            <CardRow label="Apparent mag (V)" value={entry.magV.toFixed(2)} />
            <CardRow label="Absolute mag" value={entry.absMag.toFixed(2)} />
            <CardRow label="Radius" value={`${entry.radiusSolar.toLocaleString()} R☉`} />
            <CardRow label="Temperature" value={`${entry.temperatureK.toLocaleString()} K`} />
            {entry.massSolar != null && (
              <CardRow label="Mass" value={`${entry.massSolar.toLocaleString()} M☉`} />
            )}
            {entry.luminositySolar != null && (
              <CardRow label="Luminosity" value={`${entry.luminositySolar.toLocaleString()} L☉`} />
            )}
            {entry.ageGyr != null && (
              <CardRow label="Age" value={`${entry.ageGyr.toLocaleString()} Gyr`} />
            )}
            {entry.variable && (
              <CardRow
                label="Variability"
                value={`${entry.variable.type} (mag ${entry.variable.magRange[0]}–${entry.variable.magRange[1]})`}
              />
            )}
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
