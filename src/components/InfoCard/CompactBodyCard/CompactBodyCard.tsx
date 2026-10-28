/**
 * CompactBodyCard — slim hover preview for a scene body. Both fields are synchronous
 * (`BodyInfo.label`, `constellationOfBody`), so it shows before the meta sidecar loads.
 */

import type { ReactNode } from 'react';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { CraftInfo } from '../../../@types/engine/CraftInfo';
import type { EarthSceneInfo } from '../../../@types/engine/EarthSceneInfo';
import { constellationOfBody } from '../../../utils/scene/constellationOfBody';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactBodyCard.module.css';

export type CompactBodyCardProps = {
  target: BodyInfo | CraftInfo | EarthSceneInfo;
};

function CompactBodyCard({ target }: CompactBodyCardProps): ReactNode {
  // A planet, or a star in no constellation (the Sun), renders name-only.
  const constellation = constellationOfBody(target.id);

  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
      {constellation && <div className={styles.cardDistLine}>{constellation}</div>}
    </div>
  );
}

export default CompactBodyCard;
