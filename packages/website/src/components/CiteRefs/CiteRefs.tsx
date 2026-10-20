/*
 * CiteRefs — the papers to cite for the data, source by source: the sources
 * of data/citeRefs.ts in the families of the list of all sources. A name
 * opens the source's page; a source whose holder also asks for a set text is
 * marked with one word that leads to that text on the credits page.
 */
import { Fragment } from 'react';

import { CITE_REFS } from '../../data/citeRefs.ts';
import { DATA_ENTRIES, DATA_FAMILIES_USED } from '../../data/dataPages.ts';
import { asksAcknowledgement } from '../../utils/asksAcknowledgement.ts';
import DocLink from '../DocLink/DocLink.tsx';
import RefLine from '../RefLine/RefLine.tsx';
import styles from './CiteRefs.module.css';

function CiteRefs() {
  const families = DATA_FAMILIES_USED.map((family) => ({
    name: family.name,
    entries: DATA_ENTRIES.filter((entry) => entry.family === family.id && entry.id in CITE_REFS),
  })).filter((family) => family.entries.length > 0);

  return families.map((family) => (
    <Fragment key={family.name}>
      <h3>{family.name}</h3>
      <dl>
        {family.entries.map((entry) => (
          <Fragment key={entry.id}>
            <dt id={`cite-${entry.id}`} className={styles.name}>
              <DocLink href={entry.href}>{entry.title}</DocLink>
              {asksAcknowledgement(entry.record.fields.Attribution ?? '') && (
                <span className={styles.asks}>
                  {' '}
                  with an{' '}
                  <DocLink
                    href={`/docs/credits/#${entry.id}`}
                    aria-label={`Acknowledgement: ${entry.title}`}
                  >
                    acknowledgement
                  </DocLink>
                </span>
              )}
            </dt>
            {CITE_REFS[entry.id]!.map((reference, i) => (
              <dd key={i} className={styles.reference}>
                <RefLine reference={reference} />
              </dd>
            ))}
          </Fragment>
        ))}
      </dl>
    </Fragment>
  ));
}

export default CiteRefs;
