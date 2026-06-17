/**
 * StructureDetailCard — rich panel for a focused cluster / supercluster / void.
 * Shows name, category, distance from observer, physical radius, and — for
 * clusters carrying one — the Abell/ACO designation.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import { formatDistance } from '../../utils/format/formatDistance';
import { formatAbellDesignation } from '../../utils/format/formatAbellDesignation';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import { DescriptionBlock } from './DescriptionBlock';
import { InfoTip } from '../InfoTip/InfoTip';
import { TIPS } from './tooltips';
import styles from './cardChrome.module.css';

export type StructureDetailCardProps = {
  structure: StructureInfo;
  pinned?: boolean;
  /**
   * Catalogued galaxies inside this structure's membership sphere at the
   * current tier + galaxy catalog visibility, or null/undefined when not countable
   * (famous-galaxy structure, or catalogs not loaded yet) — in which case the
   * row is omitted rather than flashing a misleading "0".
   */
  memberCount?: number | null;
  chrome?: boolean;
  onFocus?: (structure: StructureInfo) => void;
  onClose?: () => void;
};

export function StructureDetailCard({
  structure,
  pinned = false,
  memberCount,
  chrome = true,
  onFocus,
  onClose,
}: StructureDetailCardProps): ReactNode {
  const distanceMpc = Math.hypot(
    structure.worldPos[0],
    structure.worldPos[1],
    structure.worldPos[2],
  );
  const outerClass = cx(
    styles.infoCardFull,
    styles.structure,
    pinned && styles.pinned,
    !chrome && styles.chromeless,
  );

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        eyebrow="Structure"
        onFocus={pinned && onFocus ? () => onFocus(structure) : undefined}
        focusAriaLabel={`Focus camera on ${structure.name}`}
        onClose={pinned ? onClose : undefined}
      />

      <CardRow type="headline" badge={CATEGORY_DISPLAY_INFO[structure.category].label}>
        {structure.name}
      </CardRow>

      <div className={styles.cardSection}>
        <CardRow
          label={<InfoTip {...TIPS.structureDistance!}>Distance</InfoTip>}
          value={formatDistance(distanceMpc)}
        />
        <CardRow
          label={<InfoTip {...TIPS.structureRadius!}>Radius</InfoTip>}
          value={formatDistance(structure.physicalRadiusMpc)}
        />
        {memberCount != null && (
          <CardRow
            label={<InfoTip {...TIPS.memberCount!}>Galaxies</InfoTip>}
            value={memberCount.toLocaleString()}
          />
        )}
        {structure.category === 'cluster' && structure.abell !== undefined && (
          <CardRow
            label={<InfoTip {...TIPS.abell!}>Abell</InfoTip>}
            value={formatAbellDesignation(structure.abell)}
          />
        )}
        {structure.description && (
          // Curated Wikipedia-lead blurb (featured anchors) or the build's
          // auto one-liner (bulk entries).  Shares DescriptionBlock with
          // GalaxyDetailCard so the show-more toggle sits in the same place.
          <DescriptionBlock text={structure.description} />
        )}
      </div>
    </div>
  );
}
