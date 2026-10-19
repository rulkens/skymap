/*
 * PressPictures — the pictures shown with their terms, in halves of the page grid: each with its
 * name, what it shows, the credit to print, the terms, and links to the view
 * and to the widest file the site holds. The cards share their rows (subgrid),
 * so the same line of two cards sits at the same height whatever its length.
 */
import { appLink } from '../../data/appLink.ts';
import { PRESS_PICTURES } from '../../data/pressPictures.ts';
import { siteShot } from '../../data/siteShot.ts';
import { shotSources } from '../../utils/shotSources.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import Shot from '../Shot/Shot.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './PressPictures.module.css';

const press = PRESS_PICTURES.map((row) => {
  const shot = siteShot(row.shot);
  // The manifest lists widths widest first, and the srcset keeps that order.
  return {
    ...row,
    view: shot,
    file: shotSources(row.shot).webp.split(' ')[0]!,
    width: shot.widths[0]!,
  };
});

function PressPictures() {
  return (
    <ul className={styles.root}>
      {press.map((row) => (
        <li key={row.shot}>
          <Shot
            id={row.shot}
            sizes="(max-width: 900px) calc(100vw - 2.5rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem"
          />
          <h3>{row.title}</h3>
          <dl className={styles.terms}>
            <div>
              <dt>Shows</dt>
              <dd>
                <span className={styles.name}>{row.view.title}</span> {row.view.caption}
              </dd>
            </div>
            <div>
              <dt>Data and drawing</dt>
              <dd>{row.view.drawn}</dd>
            </div>
            <div>
              <dt>Credit to print</dt>
              <dd>{row.credit}.</dd>
            </div>
            <div>
              <dt>Reuse</dt>
              <dd>Ask us first. {row.terms}</dd>
            </div>
          </dl>
          <p className={styles.links}>
            <ViewLink href={appLink(row.view.link, row.view.query)}>
              {row.view.link.startsWith('tour=') ? 'Start the tour' : 'Open this view'}
            </ViewLink>
            <ObjLink size="small" href={row.file}>
              {`The file, ${row.width.toLocaleString('en-GB')} pixels wide`}
            </ObjLink>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default PressPictures;
