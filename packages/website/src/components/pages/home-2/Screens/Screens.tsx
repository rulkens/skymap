/*
 * Screens — Home's row of the screens Skymap runs on, each showing Saturn: a phone, a tablet, a desktop and
 * a dome. Each is drawn near its real size against the others, standing on one line, with its name and a
 * few words under it. Narrow, the row is two by two.
 */
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import SectionHead from '../../../shared/layout/SectionHead/SectionHead.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import DeviceFrame from '../../../shared/media/DeviceFrame/DeviceFrame.tsx';
import Disc from '../../../shared/media/Disc/Disc.tsx';
import Phone3D from '../../../shared/media/Phone3D/Phone3D.tsx';
import styles from './Screens.module.css';

function Screens() {
  return (
    <section className={styles.root} id="screens">
      <SectionHead title="Explore the universe anywhere">
        <p>
          The same view of Saturn on four screens. Skymap runs in a browser, with nothing to
          install.
        </p>
        <ViewLink hang href={appLink(siteShot('start-saturn').link)}>
          Open Saturn
        </ViewLink>
      </SectionHead>
      <div className={styles.row}>
        <div className={cx(styles.part, styles.phone)}>
          <div className={styles.device}>
            <Phone3D shot="features-phone" />
          </div>
          <div>
            <h3>Phone</h3>
            <p className={styles.note}>In the phone’s browser, moved with your fingers.</p>
          </div>
        </div>
        <div className={cx(styles.part, styles.tablet)}>
          <div className={styles.device}>
            <DeviceFrame
              device="tablet"
              shot="saturn-portrait"
              sizes="(max-width: 900px) 45vw, 14rem"
            />
          </div>
          <div>
            <h3>Tablet</h3>
            <p className={styles.note}>The same view on a larger touch screen.</p>
          </div>
        </div>
        <div className={cx(styles.part, styles.desktop)}>
          <div className={styles.device}>
            <DeviceFrame
              device="desktop"
              shot="start-saturn"
              sizes="(max-width: 900px) 45vw, 27rem"
            />
          </div>
          <div>
            <h3>Desktop</h3>
            <p className={styles.note}>The full app, with a mouse and a keyboard.</p>
          </div>
        </div>
        <div className={cx(styles.part, styles.dome)}>
          <div className={styles.device}>
            <Disc id="dome-saturn" sizes="(max-width: 900px) 40vw, 14rem" />
          </div>
          <div>
            <h3>Dome</h3>
            <p className={styles.note}>
              A fisheye picture for a planetarium dome, steered from a phone.
            </p>
            <ObjLink size="small" hang href={sitePath('/domes/')}>
              Domes and museums
            </ObjLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Screens;
