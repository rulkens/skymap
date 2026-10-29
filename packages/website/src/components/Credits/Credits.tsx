/* Credits — who made the images and catalogues Home shows: each name a link to its source, its licence in words, and one way to the credits page for the terms in full. */
import { Fragment } from 'react';

import { DATA_CREDITS, IMAGE_CREDITS } from '../../data/credits.ts';
import { sitePath } from '../../utils/sitePath.ts';
import styles from './Credits.module.css';

const groups = [
  { label: 'Images', credits: IMAGE_CREDITS },
  { label: 'Catalogues', credits: DATA_CREDITS },
];

function Credits() {
  return (
    <section className={styles.root} id="credits" aria-labelledby="credits-title">
      <h2 id="credits-title">Credits</h2>
      {groups.map((group) => (
        <p key={group.label}>
          <b>{group.label}.</b>{' '}
          {group.credits.map((credit, i) => (
            <Fragment key={credit.name}>
              {i > 0 && '; '}
              <a href={credit.href}>{credit.name}</a> ({credit.licence})
            </Fragment>
          ))}
          .
        </p>
      ))}
      <p>
        The acknowledgements some releases require, and every source’s terms in full, are on the{' '}
        <a href={sitePath('/docs/credits/')}>credits page</a>.
      </p>
    </section>
  );
}

export default Credits;
