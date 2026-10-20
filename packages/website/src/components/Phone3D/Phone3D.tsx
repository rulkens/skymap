/*
 * Phone3D — a phone drawn in CSS around one manifest picture of the app on a phone. The case is a stack
 * of slices behind the front, so its edge shows depth once the phone is turned. It rests at a fixed tilt;
 * phoneTurn.client.ts turns it a little toward the pointer where there is one and motion is welcome.
 * The host sets its width with `--phone-width`.
 */
import Shot from '../Shot/Shot.tsx';
import styles from './Phone3D.module.css';

type Phone3DProps = { shot: string; alt?: string };

const SLICES = 9;

function Phone3D({ shot, alt }: Phone3DProps) {
  return (
    <div className={styles.root} data-phone3d>
      <div className={styles.case}>
        {Array.from({ length: SLICES }, (_, i) => (
          <span key={i} className={styles.slice} style={{ transform: `translateZ(${-i - 1}px)` }} />
        ))}
        <div className={styles.front}>
          <div className={styles.screen}>
            <Shot id={shot} sizes="15rem" alt={alt} />
          </div>
          <span className={styles.island} />
        </div>
      </div>
    </div>
  );
}

export default Phone3D;
