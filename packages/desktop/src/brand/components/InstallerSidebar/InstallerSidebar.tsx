/**
 * InstallerSidebar — the 164 × 314 bitmap down the left of the Windows installer's welcome and finish
 * pages (and the uninstaller's): a strip of the star field with the wordmark at the top.
 */

import type { ReactNode } from 'react';
import Wordmark from '../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import ControlSky from '../../../control/sky/components/ControlSky/ControlSky';
import styles from './InstallerSidebar.module.css';

function InstallerSidebar(): ReactNode {
  return (
    <div className={styles.root}>
      <ControlSky />
      <h1 className={styles.mark}>
        <Wordmark />
      </h1>
    </div>
  );
}

export default InstallerSidebar;
