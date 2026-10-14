/**
 * StructureDetailCard — rich panel for a focused structure. Shows name,
 * category, distance from observer, physical radius, and the rows only some
 * categories carry (Abell designation, nebula type, assumed line of sight).
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { StructureInfo } from '../../../../@types/data/structure/StructureInfo';
import { formatDistance } from '../../../../utils/format/formatDistance';
import { formatAbellDesignation } from '../../../../utils/format/formatAbellDesignation';
import { CATEGORY_DISPLAY_INFO } from '../../../../data/structure/categoryDisplayInfo';
import { structureShotUrl } from '../../../../utils/structure/structureShotUrl';
import { NEBULA_KIND_LABELS } from '../../../../data/structure/nebulaKindLabels';
import CardHeader from '../../../../components/InfoCard/CardHeader/CardHeader';
import Thumbnail from '../../../../components/InfoCard/Thumbnail/Thumbnail';
import CardRow from '../../../../components/InfoCard/CardRow/CardRow';
import ShotSummary from '../../../../components/InfoCard/ShotSummary/ShotSummary';
import DescriptionBlock from '../../../../components/InfoCard/DescriptionBlock/DescriptionBlock';
import WikipediaRow from '../../../../components/InfoCard/WikipediaRow/WikipediaRow';
import { InfoTip } from '../../../../components/InfoTip/InfoTip';
import { TIPS } from '../../../../components/InfoCard/tooltips';
import type { CardLayout } from '../../../../@types/components/infoCard/CardLayout';
import styles from '../../../../components/InfoCard/cardChrome.module.css';
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
  layout?: CardLayout;
  onFocus?: (target: StructureInfo) => void;
  onClose?: () => void;
};

function StructureDetailCard({
  target,
  isPinned = false,
  memberCount,
  layout = 'panel',
  onFocus,
  onClose,
}: StructureDetailCardProps): ReactNode {
  const distanceMpc = Math.hypot(target.worldPos[0], target.worldPos[1], target.worldPos[2]);
  const shot = target.featured ? structureShotUrl(target.id) : undefined;
  // The phone header carries the shot; only the panel puts it beside the lead rows.
  const shotBeside = shot !== undefined && layout === 'panel';
  // With a shot beside them the lead rows sit next to it as summary lines (as the body card
  // does); without one they stay ordinary CardRows.
  const countRow =
    memberCount != null
      ? {
          label: <InfoTip {...TIPS.memberCount!}>Galaxies</InfoTip>,
          value: memberCount.toLocaleString(),
        }
      : null;
  const leadRows = [
    {
      label: <InfoTip {...TIPS.structureDistance!}>Distance</InfoTip>,
      value: formatDistance(distanceMpc),
    },
    {
      label: <InfoTip {...TIPS.structureRadius!}>Radius</InfoTip>,
      value: formatDistance(target.physicalRadiusMpc),
    },
  ];
  // Rows below the top row; the section is dropped when the shot took them all.
  const rows = [
    ...(shotBeside ? [] : leadRows),
    ...(target.category === 'nebula'
      ? [{ label: 'Type', value: NEBULA_KIND_LABELS[target.nebulaKind] }]
      : []),
    ...(!shotBeside && countRow ? [countRow] : []),
    ...(target.category === 'galaxy-cluster' && target.abell !== undefined
      ? [
          {
            label: <InfoTip {...TIPS.abell!}>Abell</InfoTip>,
            value: formatAbellDesignation(target.abell),
          },
        ]
      : []),
  ];
  const outerClass = cx(
    local.root,
    isPinned && styles.pinned,
    layout === 'phone' && styles.chromeless,
  );

  return (
    <div className={outerClass} role="status" aria-live="polite">
      <CardHeader
        layout={layout}
        eyebrow="Structure"
        title={target.name}
        badge={CATEGORY_DISPLAY_INFO[target.category].label}
        thumbnail={
          shot !== undefined ? <Thumbnail url={shot} alt={`${target.name} thumbnail`} /> : undefined
        }
        onFocus={isPinned && onFocus ? () => onFocus(target) : undefined}
        focusAriaLabel={`Focus camera on ${target.name}`}
        onClose={isPinned ? onClose : undefined}
      />

      {shotBeside && (
        <ShotSummary
          url={shot}
          alt={`${target.name} thumbnail`}
          rows={[...leadRows, ...(countRow ? [countRow] : [])]}
        />
      )}

      {rows.length > 0 && (
        <div className={styles.cardSection}>
          {rows.map((row, i) => (
            <CardRow key={i} {...row} />
          ))}
        </div>
      )}

      {target.wikipediaTitle && (
        <div className={styles.cardSection}>
          <WikipediaRow title={target.wikipediaTitle} />
        </div>
      )}
      {target.description && (
        // Curated Wikipedia-lead blurb (featured anchors) or the build's
        // auto one-liner (bulk entries).  Shares DescriptionBlock with
        // GalaxyDetailCard so the show-more toggle sits in the same place.
        <div className={styles.cardSection}>
          <DescriptionBlock text={target.description} />
        </div>
      )}
    </div>
  );
}

export default StructureDetailCard;
