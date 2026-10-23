/*
 * RemoteDemo — the Domes section's picture: a film of a dome swinging round Earth with a phone showing the
 * paired remote over its bottom right (below it where narrow), and a finger on the phone's drag pad that
 * moves left and right as the film swings. The finger is
 * placed from the film's own `--turn` (see DiscFilm), so it cannot drift from the picture. The film's first
 * half turns the scene to the right, so that is when the finger goes right. Where the film does not play the
 * finger is hidden and the phone is a still.
 */
import { useRef } from 'react';

import FeatureFilm from '../FeatureFilm/FeatureFilm.tsx';
import Phone3D from '../Phone3D/Phone3D.tsx';
import styles from './RemoteDemo.module.css';

type RemoteDemoProps = { sizes: string };

function RemoteDemo({ sizes }: RemoteDemoProps) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className={styles.root}>
      <FeatureFilm film="features-dome-remote" sizes={sizes} turnOn={root} />
      <div className={styles.phone}>
        <Phone3D shot="features-remote">
          <span className={styles.pad} aria-hidden="true">
            <span className={styles.finger} />
          </span>
        </Phone3D>
      </div>
    </div>
  );
}

export default RemoteDemo;
