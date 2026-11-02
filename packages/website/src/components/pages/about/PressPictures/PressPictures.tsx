/*
 * PressPictures — the pictures shown with their terms, as prints in halves of the page grid: each with a
 * printer's crop marks at its corners, its name beside the pixel size of the widest file the site holds, what it
 * shows, the credit to print (with a control that copies it), the terms, and links to the view and the file. The
 * cards share their rows (subgrid), so the same line of two cards sits at the same height whatever its length.
 */
import { PRESS_PICTURES } from '../../../../data/pressPictures.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { shotSources } from '../../../../utils/shotSources.ts';
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import styles from './PressPictures.module.css';

const press = PRESS_PICTURES.map((row) => {
  const sources = shotSources(row.shot);
  // The manifest lists widths widest first, and the srcset keeps that order; the file keeps the shot's shape.
  const width = siteShot(row.shot).widths[0]!;
  return {
    ...row,
    view: siteShot(row.shot),
    file: sources.full,
    pixels: `${width} × ${Math.round((width * sources.height) / sources.width)}`,
    credit: `${row.credit}.`,
  };
});

function PressPictures() {
  return (
    <ul className={styles.root}>
      {press.map((row) => (
        <li key={row.shot}>
          <div className={styles.print}>
            <Shot
              id={row.shot}
              sizes="(max-width: 900px) calc(100vw - 2.5rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem"
            />
          </div>
          <div className={styles.label}>
            <h3>{row.title}</h3>
            <p className={styles.pixels}>
              {row.pixels} <abbr title="pixels">px</abbr>
            </p>
          </div>
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
              <dd className={styles.credit}>
                <span>{row.credit}</span>
                <CopyButton text={row.credit} label="Copy the credit" />
              </dd>
            </div>
            <div>
              <dt>Reuse</dt>
              <dd>Ask us first. {row.terms}</dd>
            </div>
          </dl>
          <p className={styles.links}>
            <ViewLink view={row.view.link} query={row.view.query}>
              {row.view.link.startsWith('tour=') ? 'Start the tour' : 'Open this view'}
            </ViewLink>
            <ObjLink size="small" href={row.file}>
              The full-size file
            </ObjLink>
          </p>
        </li>
      ))}
    </ul>
  );
}

export default PressPictures;
