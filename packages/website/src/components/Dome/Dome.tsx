/* Dome — Home's pitch for domes and museums: a frame from the app's dome mode in its ring, with its label, beside the words and the way to the domes page. */
import { sitePath } from '../../utils/sitePath.ts';
import Disc from '../Disc/Disc.tsx';
import ObjLink from '../ObjLink/ObjLink.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Dome.module.css';

function Dome() {
  return (
    <section className={styles.root} id="dome">
      <figure className={styles.figure}>
        <div className={styles.dome}>
          <Disc
            id="dome-saturn"
            sizes="(max-width: 900px) calc(85vw - 2.125rem), (max-width: 1239px) calc(41.7vw - 4rem), 28.25rem"
          />
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id="dome-saturn" />
        </figcaption>
      </figure>
      <div className={styles.copy}>
        <h2>Put it on a dome</h2>
        <p>
          Skymap can render fisheye projections live or to video, in 4K. There are also many options
          to integrate Skymap into a kiosk setup.
        </p>
        <ObjLink hang href={sitePath('/domes/')}>
          For domes and museums
        </ObjLink>
      </div>
    </section>
  );
}

export default Dome;
