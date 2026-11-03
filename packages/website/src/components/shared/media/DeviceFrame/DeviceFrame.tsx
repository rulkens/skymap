/*
 * DeviceFrame — one manifest picture in a plain drawing of the screen it stands for: a tablet (a bezel
 * with rounded corners) or a desktop (a thin bezel on a stand). Flat and quiet beside Phone3D, which is
 * the one device drawn in depth. It is as wide as the box it is put in; the screen takes the picture's shape.
 */
import { cx } from '../../../../utils/cx.ts';
import Shot from '../Shot/Shot.tsx';
import styles from './DeviceFrame.module.css';

type DeviceFrameProps = { shot: string; sizes: string; device: 'tablet' | 'desktop' };

function DeviceFrame({ shot, sizes, device }: DeviceFrameProps) {
  return (
    <div className={cx(styles.root, styles[device])}>
      <div className={styles.screen}>
        <Shot id={shot} sizes={sizes} />
      </div>
    </div>
  );
}

export default DeviceFrame;
