/*
 * VoyagerPath — Voyager 1's computed path out of the Solar System, across the gap above Write to us, with the
 * spacecraft at its end beside the address: the farthest message we have sent, carried on a golden record. The
 * path is the app's own drawing, turned so it runs down the page, and it draws itself outward from the Sun as
 * the section scrolls in. Only the line of Voyager 1 is kept; Voyager 2's path and the galaxies are masked off.
 */
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './VoyagerPath.module.css';

function VoyagerPath() {
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.sun}>
        <div className={styles.path}>
          <Shot id="orbits-voyager" sizes="140vw" alt="" />
        </div>
      </div>
      <div className={styles.craft}>
        <Shot id="cut-voyager1" sizes="(max-width: 900px) 70vw, 30rem" alt="" />
      </div>
    </div>
  );
}

export default VoyagerPath;
