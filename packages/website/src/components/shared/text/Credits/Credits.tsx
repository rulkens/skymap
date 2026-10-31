/*
 * Credits — who made the images and catalogues a page shows, set as a colophon: the title over one line on why
 * we credit, then each group as a list of sources, each name a link to its source beside its licence in words,
 * and one way to the credits page for the terms in full.
 */
import { DATA_CREDITS, IMAGE_CREDITS } from '../../../../data/credits.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import styles from './Credits.module.css';

const groups = [
  { label: 'Images', credits: IMAGE_CREDITS },
  { label: 'Catalogues', credits: DATA_CREDITS },
];

function Credits() {
  return (
    <section className={styles.root} id="credits" aria-labelledby="credits-title">
      <div className={styles.head}>
        <h2 id="credits-title">Credits</h2>
        <p className={styles.why}>
          The pictures and data here are other people’s work, and their licences ask us to name
          them.
        </p>
      </div>
      <div className={styles.body}>
        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.label}>{group.label}</p>
            <dl className={styles.list}>
              {group.credits.map((credit) => (
                <div key={credit.name} className={styles.row}>
                  <dt>
                    <a href={credit.href}>{credit.name}</a>
                  </dt>
                  <dd>{credit.licence}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className={styles.more}>
          The acknowledgements some releases require, and every source’s terms in full, are on the{' '}
          <a href={sitePath('/docs/credits/')}>credits page</a>.
        </p>
      </div>
    </section>
  );
}

export default Credits;
