/* Honesty — Home's three bins, Measured, Derived and Drawn: each a picture that stands for the word, then the lines that are that kind of claim, each a link to its source. */
import { HONESTY } from '../../data/honesty.ts';
import { HONESTY_BINS } from '../../data/honestyBins.ts';
import { sitePath } from '../../utils/sitePath.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Honesty.module.css';

function Honesty() {
  return (
    <section className={styles.root} id="honest">
      <div className={styles.intro}>
        <h2>What is measured, derived and drawn</h2>
        <ObjLink hang size="small" href={sitePath('/science/')}>
          The science behind Skymap
        </ObjLink>
      </div>
      {HONESTY_BINS.map((bin) => (
        <div key={bin.id} className={styles.bin}>
          <h3>{bin.title}</h3>
          <p className={styles.gloss}>{bin.gloss}</p>
          <figure className={styles.figure}>
            <Shot
              id={bin.shot}
              sizes="(max-width: 900px) calc(100vw - 2.5rem), (max-width: 1239px) calc(33.4vw - 3.75rem), 22rem"
            />
            <figcaption>
              <ShotCaption id={bin.shot} />
            </figcaption>
          </figure>
          <ul className={styles.items}>
            {HONESTY[bin.id].map((item) => (
              <li key={item.href + item.text}>
                <a href={item.href}>{item.text}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default Honesty;
