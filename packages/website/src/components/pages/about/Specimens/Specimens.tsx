/*
 * Specimens — the colophon's two typefaces, each named large in itself over its sourced fact, and beside the
 * display face the app's own constellation names cut out as light: the labels the Headings fact says share its
 * face. The names come from the data the facts are written from. Narrow, the picture follows the faces.
 */
import { fact } from '../../../../data/fact.ts';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Specimens.module.css';
import { ID, SPECIMENS } from './Specimens.constants.ts';

function Specimens() {
  return (
    <div className={styles.root}>
      <dl className={styles.faces}>
        {SPECIMENS.map(({ term, name, id, face }) => {
          const row = fact(id);
          return (
            <div key={id}>
              <dt>{term}</dt>
              <dd className={face}>{name}</dd>
              <dd className={styles.fact}>
                {row.text} <a href={row.source}>Source: {row.sourceLabel}</a>
              </dd>
            </div>
          );
        })}
      </dl>
      <figure className={styles.sky}>
        <div className={styles.cutout}>
          <Shot id={ID} sizes="(max-width: 900px) 100vw, 50vw" />
        </div>
        <figcaption>
          <ShotCaption id={ID} showDrawn={false} />
        </figcaption>
      </figure>
    </div>
  );
}

export default Specimens;
