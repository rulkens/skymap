/* Classroom — Home's pitch for lessons: a view, the address that opens it for every pupil, and the way to the classroom page. */
import { HOME_LINKS } from '../../data/homeLinks.ts';
import { sitePath } from '../../utils/sitePath.ts';
import AddressStrip from '../AddressStrip/AddressStrip.tsx';
import ObjLink from '../ObjLink/ObjLink.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Classroom.module.css';

function Classroom() {
  return (
    <section className={styles.root} id="classroom">
      <div className={styles.frame}>
        <Shot
          id="classroom-jupiter"
          sizes="(max-width: 900px) calc(100vw - 2.5rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem"
        />
        {/* The example address is built from the same hash the deep-link test parses. */}
        <AddressStrip hash={HOME_LINKS.classroom} />
        <div className={styles.caption}>
          <ShotCaption id="classroom-jupiter" open={false} />
        </div>
      </div>
      <div className={styles.copy}>
        <h2>Use it in the classroom</h2>
        <p>
          Set up a view and copy its address. Every pupil who opens the link starts on the same
          object at the same date, and so does next year’s class.
        </p>
        <ObjLink hang href={sitePath('/classroom/')}>
          Use Skymap in the classroom
        </ObjLink>
      </div>
    </section>
  );
}

export default Classroom;
