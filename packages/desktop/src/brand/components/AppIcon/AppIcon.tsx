/**
 * AppIcon — the site's favicon mark on a rounded black tile, in vw so one drawing serves every size.
 * macOS gets Apple's icon grid (the tile at 824 of 1024, a soft drop shadow); Windows the tile full-bleed.
 */

import type { ReactNode } from 'react';
import markUrl from '../../../../../../public/favicon.svg?url';
import styles from './AppIcon.module.css';

export type AppIconProps = {
  readonly platform: 'mac' | 'win';
};

function AppIcon({ platform }: AppIconProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={platform === 'mac' ? styles.mac : styles.win}>
        <img className={styles.mark} src={markUrl} alt="" />
      </div>
    </div>
  );
}

export default AppIcon;
