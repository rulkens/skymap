/**
 * StructureDetailCard — rich panel for a focused cluster / supercluster / void.
 * Shows name, category, distance from observer, physical radius, and — for
 * clusters carrying one — the Abell/ACO designation.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import { formatDistance } from '../../../utils/format/formatDistance';
import { formatAbellDesignation } from '../../../utils/format/formatAbellDesignation';
import { CATEGORY_DISPLAY_INFO } from '../../../data/structure/categoryDisplayInfo';
import CardHeader from '../CardHeader/CardHeader';
import CardRow from '../CardRow/CardRow';
import DescriptionBlock from '../DescriptionBlock/DescriptionBlock';
import { InfoTip } from '../../InfoTip/InfoTip';
import { TIPS } from '../tooltips';
import styles from '../cardChrome.module.css';
import local from './StructureDetailCard.module.css';

export type StructureDetailCardProps = {
  target: StructureInfo;
  isPinned?: boolean;
  /**
   * Catalogued galaxies inside this structure's membership sphere at the
   * current tier + galaxy catalog visibility, or null/undefined when not countable
   * (famous-galaxy structure, or catalogs not loaded yet) — in which case the
   * row is omitted rather than flashing a misleading "0".
   */
  memberCount?: number | null;
  hasChrome?: boolean;
  onFocus?: (target: StructureInfo) => void;
  onClose?: () => void;
};

function StructureDetailCard({
  target,
  isPinned = false,
  memberCount,
  hasChrome = true,
  onFocus,
  onClose,
}: StructureDetailCardProps): ReactNode {
  const distanceMpc = Math.hypot(target.worldPos[0], target.worldPos[1], target.worldPos[2]);
  const outerClass = cx(local.root, isPinned && styles.pinned, !hasChrome && styles.chromeless);

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Structure"
        onFocus={isPinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.name}`}
        onClose={isPinned ? onClose : undefined}
      />

      <CardRow type="headline" badge={CATEGORY_DISPLAY_INFO[target.category].label}>
        {target.name}
      </CardRow>

      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.structureDistance!}>Distance</InfoTip>}
          value={formatDistance(distanceMpc)}
        />
        <CardRow
          label={<InfoTip {...TIPS.structureRadius!}>Radius</InfoTip>}
          value={formatDistance(target.physicalRadiusMpc)}
        />
        {memberCount != null && (
          <CardRow
            label={<InfoTip {...TIPS.memberCount!}>Galaxies</InfoTip>}
            value={memberCount.toLocaleString()}
          />
        )}
        {target.category === 'cluster' && target.abell !== undefined && (
          <CardRow
            label={<InfoTip {...TIPS.abell!}>Abell</InfoTip>}
            value={formatAbellDesignation(target.abell)}
          />
        )}
        {target.description && (
          // Curated Wikipedia-lead blurb (featured anchors) or the build's
          // auto one-liner (bulk entries).  Shares DescriptionBlock with
          // GalaxyDetailCard so the show-more toggle sits in the same place.
          <DescriptionBlock text={target.description} />
        )}
      </div>
    </div>
  );
}

export default StructureDetailCard;
