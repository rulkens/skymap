/**
 * AppIcon — the Skymap icon filling the page, from the same drawing as the site's favicon
 * (website utils/skymapIcon): Apple's icon grid on macOS, a full-bleed rounded tile on Windows.
 */

import type { ReactNode } from 'react';
import type { MarkDrawing } from '../../../../../website/src/@types/MarkDrawing';
import { skymapIcon } from '../../../../../website/src/utils/skymapIcon';
import styles from './AppIcon.module.css';

export type AppIconProps = {
  readonly platform: 'mac' | 'win';
  readonly drawing: MarkDrawing;
};

function AppIcon({ platform, drawing }: AppIconProps): ReactNode {
  const svg = skymapIcon(platform === 'mac' ? 'mac' : 'rounded', drawing);
  return (
    <img className={styles.root} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt="" />
  );
}

export default AppIcon;
