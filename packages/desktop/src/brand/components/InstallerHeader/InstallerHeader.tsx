/**
 * InstallerHeader — the 150 × 57 bitmap at the right of the Windows installer's header band, which
 * installer.nsh paints the same black, so the wordmark sits in one dark bar with the page title.
 */

import type { ReactNode } from 'react';
import Wordmark from '../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import ControlSky from '../../../control/sky/components/ControlSky/ControlSky';
import styles from './InstallerHeader.module.css';

function InstallerHeader(): ReactNode {
  return (
    <div className={styles.root}>
      <ControlSky />
      <h1 className={styles.mark}>
        <Wordmark />
      </h1>
    </div>
  );
}

export default InstallerHeader;
