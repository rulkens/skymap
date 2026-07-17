/**
 * StarDetailCard — rich panel for a focused famous star.
 *
 * The engine hands React a lean `StarInfo` (id + label + position) so a star is
 * always immediately selectable; the narrative/physical rows live in the async
 * `famous_stars_meta.json` sidecar.  This card looks its entry up by `id` in
 * `useFamousStarsMeta()` and fills in the properties block + description once the
 * fetch settles.  Before that (or on a dev clone with no sidecar) it renders the
 * headline alone — the fail-soft path the hook's `ready` contract guarantees.
 *
 * Optional physical fields (mass, luminosity, age, variability) drop their row
 * entirely when absent rather than showing a blank — the same absent-row pattern
 * the galaxy/structure cards use.  Aliases trail the primary name as a muted
 * "also known as" line (names.slice(1), mirroring GalaxyDetailCard's idiom).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StarInfo } from '../../../@types/engine/StarInfo';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { formatDistance } from '../../../utils/format/formatDistance';
import { useFamousStarsMeta } from '../../../hooks/useFamousStarsMeta';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
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
  const { famousStarsMeta } = useFamousStarsMeta();
  const entry = famousStarsMeta.find((m) => m.id === target.id);

  const outerClass = cx(local.root, pinned && styles.pinned, !chrome && styles.chromeless);
  const aliases = entry ? entry.names.slice(1) : [];

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Star"
        onFocus={pinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.label}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.label}</CardRow>
      {aliases.length > 0 && <div className={styles.headlineAlias}>{aliases.join(' · ')}</div>}

      {/*
        No entry yet (fetch in flight, or a deployment without the sidecar):
        headline only — the fail-soft path.  The properties + description fill in
        the instant the sidecar resolves.
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
              <CardRow
                label="Luminosity"
                value={`${entry.luminositySolar.toLocaleString()} L☉`}
              />
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

export default StarDetailCard;
