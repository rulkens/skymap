/**
 * DmgBackground — the disk image's window: the star field, the wordmark, and an arrow from the app to
 * Applications. The two empty slots keep stars off the icons Finder lays on top; their centres are
 * electron-builder.yml's `dmg.contents` x and y, so a move there moves them here.
 */

import type { ReactNode } from 'react';
import Wordmark from '../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import ControlSky from '../../../control/components/ControlSky/ControlSky';
import styles from './DmgBackground.module.css';

function DmgBackground(): ReactNode {
  return (
    <div className={styles.root}>
      <ControlSky />
      <h1 className={styles.mark}>
        <Wordmark />
      </h1>
      <svg className={styles.app} aria-hidden="true" />
      <svg className={styles.arrow} viewBox="0 0 160 24" aria-hidden="true">
        <defs>
          <linearGradient id="dmg-arrow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--color-accent-link-strong)' }} />
          </linearGradient>
        </defs>
        <path d="M 2 18 Q 80 2 152 16" stroke="url(#dmg-arrow)" />
        <path d="M 143 9 L 153 16 L 142 21" stroke="var(--color-accent-link-strong)" />
      </svg>
      <svg className={styles.applications} aria-hidden="true" />
      <p className={styles.hint}>Drag Skymap to Applications</p>
    </div>
  );
}

export default DmgBackground;
