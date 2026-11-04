/**
 * AboutWindow — About on its own, for the shell's About window (openAboutWindow): it loads the
 * control page with `?view=about` and the same preload; main answers `control:getAbout` from it too.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AboutInfo } from '../../../@types/AboutInfo';
import type { ControlBridge } from '../../../@types/ControlBridge';
import AboutView from '../AboutView/AboutView';
import styles from './AboutWindow.module.css';

export type AboutWindowProps = {
  readonly bridge: ControlBridge;
};

function AboutWindow({ bridge }: AboutWindowProps): ReactNode {
  const [about, setAbout] = useState<AboutInfo | null>(null);
  useEffect(() => void bridge.getAbout().then(setAbout), [bridge]);
  return (
    <div className={styles.root}>
      <AboutView about={about} />
    </div>
  );
}

export default AboutWindow;
