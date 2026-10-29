/*
 * Disc — a fisheye frame from the app's dome mode, shown round with a ring
 * about it. The frame is a disc inscribed
 * in a square, so the round mask trims only its black corners. It is as wide
 * as the box it is put in; the ring stands `--disc-ring` outside that, which the
 * host leaves room for.
 */
import Shot from '../Shot/Shot.tsx';
import styles from './Disc.module.css';

type DiscProps = { id: string; sizes: string; eager?: boolean };

function Disc({ id, sizes, eager = false }: DiscProps) {
  return (
    <div className={styles.root}>
      <Shot id={id} sizes={sizes} eager={eager} />
    </div>
  );
}

export default Disc;
