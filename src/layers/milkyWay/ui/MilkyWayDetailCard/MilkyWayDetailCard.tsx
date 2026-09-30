/**
 * MilkyWayDetailCard — rich panel for the Milky Way singleton. Facts the engine
 * already draws (disc diameter, Sun→centre, Sgr A* mass, and the lap time from
 * them) are derived from those constants so the card can't disagree with the
 * scene; the rest are literature values in `MILKY_WAY_FACTS`.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { MilkyWayInfo } from '../../../../@types/engine/MilkyWayInfo';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';
import { MILKY_WAY_INFO } from '../../../../data/milkyWay/milkyWayInfo';
import { MILKY_WAY_FACTS } from '../../../../data/milkyWay/milkyWayFacts';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../../../data/milkyWay/galacticCenter';
import { SGR_A_STAR_MASS_SOLAR } from '../../../../data/bodies/sgrAStarMassSolar';
import { formatDiameterKpc } from '../../../../utils/format/formatDiameterKpc';
import { formatDistance } from '../../../../utils/format/formatDistance';
import { galacticYearMyr } from '../../../../utils/astro/galacticYearMyr';
import { cardShotUrl } from '../../../../utils/palette/cardShotUrl';
import { MILKY_WAY_FOCUS_ID } from '../../../../services/url/milkyWayFocusId';
import CardHeader from '../../../../components/InfoCard/CardHeader/CardHeader';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import Thumbnail from '../../../../components/InfoCard/Thumbnail/Thumbnail';
import DescriptionBlock from '../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../../../components/InfoTip/InfoTip';
import { TIPS } from '../../../../components/InfoCard/tooltips';
import styles from '../../../../components/InfoCard/cardChrome.module.css';
import mw from './MilkyWayDetailCard.module.css';

export type MilkyWayDetailCardProps = {
  target: MilkyWayInfo;
  isPinned?: boolean;
  hasChrome?: boolean;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

const DIAMETER_TEXT = formatDiameterKpc(2 * MILKY_WAY_DISC_RADIUS_KPC);
// The world origin is the Sun, so the centre anchor's length is R₀.
const SUN_TO_CENTRE_MPC = Math.hypot(...MILKY_WAY_CENTER_WORLD);
const SUN_TO_CENTRE_TEXT = formatDistance(SUN_TO_CENTRE_MPC);
const GALACTIC_YEAR_MYR = galacticYearMyr(SUN_TO_CENTRE_MPC, MILKY_WAY_FACTS.sunOrbitSpeedKmS);
const GALACTIC_YEAR_TEXT = `${Math.round(GALACTIC_YEAR_MYR)} Myr · ${MILKY_WAY_FACTS.sunOrbitSpeedKmS} km/s`;
const BLACK_HOLE_TEXT = `Sgr A* · ${(SGR_A_STAR_MASS_SOLAR / 1e6).toFixed(1)} × 10⁶ M☉`;

function MilkyWayDetailCard({
  target,
  isPinned = false,
  hasChrome = true,
  onFocus,
  onClose,
}: MilkyWayDetailCardProps): ReactNode {
  const outerClass = cx(mw.root, isPinned && styles.pinned, !hasChrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Home Galaxy"
        onFocus={isPinned && onFocus ? () => onFocus(MILKY_WAY_INFO) : undefined}
        focusAriaLabel={`Focus camera on ${target.displayName}`}
        onClose={isPinned ? onClose : undefined}
      />

      <CardRow type="headline">{target.displayName}</CardRow>

      <div className={cx(styles.cardSection, styles.cardTopRow)}>
        <Thumbnail url={cardShotUrl(MILKY_WAY_FOCUS_ID)} alt="Milky Way thumbnail" />
        <div className={styles.cardSummary}>
          <div className={styles.cardTypeLine}>
            <InfoTip {...TIPS.morphology!}>{target.typeString}</InfoTip>
          </div>
          <div className={styles.cardDistLine}>
            <InfoTip {...TIPS.sunToCentre!}>{SUN_TO_CENTRE_TEXT}</InfoTip>
          </div>
        </div>
      </div>

      <div className={styles.cardSection}>
        <CardRow label={<InfoTip {...TIPS.diameter!}>Diameter</InfoTip>} value={DIAMETER_TEXT} />
        <CardRow
          label={<InfoTip {...TIPS.milkyWayStars!}>Stars</InfoTip>}
          value={MILKY_WAY_FACTS.starCountRange}
        />
        <CardRow
          label={<InfoTip {...TIPS.milkyWayMass!}>Stellar mass</InfoTip>}
          value={MILKY_WAY_FACTS.stellarMassText}
        />
        <CardRow
          label={<InfoTip {...TIPS.milkyWayMass!}>Total mass</InfoTip>}
          value={MILKY_WAY_FACTS.totalMassText}
        />
        <CardRow
          label={<InfoTip {...TIPS.oldestStars!}>Oldest stars</InfoTip>}
          value={MILKY_WAY_FACTS.oldestStarsAgeText}
        />
        <CardRow
          label={<InfoTip {...TIPS.galacticYear!}>Galactic year</InfoTip>}
          value={GALACTIC_YEAR_TEXT}
        />
        <CardRow
          label={<InfoTip {...TIPS.centralBlackHole!}>Black hole</InfoTip>}
          value={BLACK_HOLE_TEXT}
        />
      </div>

      <div className={styles.cardSection}>
        <DescriptionBlock text={target.description} />
      </div>
    </div>
  );
}

export default MilkyWayDetailCard;
