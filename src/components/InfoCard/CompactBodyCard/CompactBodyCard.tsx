/**
 * CompactBodyCard — slim hover preview for a planet, moon, craft or Earth scene. Its one field
 * (`label`) is synchronous, so it shows before the meta sidecar loads. Stars have their own card.
 */

import type { ReactNode } from 'react';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { CraftInfo } from '../../../@types/engine/CraftInfo';
import type { EarthSceneInfo } from '../../../@types/engine/EarthSceneInfo';
import CardRow from '../CardRow/CardRow';
import styles from '../compactChrome.module.css';
import local from './CompactBodyCard.module.css';

export type CompactBodyCardProps = {
  target: BodyInfo | CraftInfo | EarthSceneInfo;
};

function CompactBodyCard({ target }: CompactBodyCardProps): ReactNode {
  return (
    <div className={local.root} role="status" aria-live="polite">
      <div className={styles.cardTitle}>
        <span>Hover</span>
      </div>
      <CardRow type="headline">{target.label}</CardRow>
    </div>
  );
}

export default CompactBodyCard;
