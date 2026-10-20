/*
 * UseLegend — the twelve `Use` terms with the one-line meaning the licence
 * record gives each at its head, shown once on a page that prints the terms.
 * With `sources` every term is followed by the sources that carry it, which
 * is the list of all sources grouped by what may be done with them.
 */
import { Fragment } from 'react';

import type { AttributionUse } from '../../../../../tools/@types/io/AttributionUse';
import { DATA_ENTRIES, DATA_USES } from '../../data/dataPages.ts';
import DocLink from '../DocLink/DocLink.tsx';
import RecordText from '../RecordText/RecordText.tsx';
import Row from '../Row/Row.tsx';
import UseTerms from '../UseTerms/UseTerms.tsx';
import styles from './UseLegend.module.css';

type UseLegendProps = { sources?: boolean };

function UseLegend({ sources = false }: UseLegendProps) {
  const terms = (Object.keys(DATA_USES) as AttributionUse[]).map((term) => ({
    term,
    entries: DATA_ENTRIES.filter((entry) => entry.record.use.includes(term)),
  }));

  return (
    <dl className={styles.root} data-embed>
      {terms.map(({ term, entries }) => (
        <Row key={term} label={<UseTerms use={[term]} />}>
          <p className={styles.meaning}>
            <RecordText text={DATA_USES[term]} phrase />
          </p>
          {sources && (
            <p className={styles.sources}>
              {entries.length} {entries.length === 1 ? 'source' : 'sources'}:{' '}
              {entries.map((entry, i) => (
                <Fragment key={entry.id}>
                  {i > 0 && ', '}
                  <DocLink href={entry.href}>{entry.title}</DocLink>
                </Fragment>
              ))}
              .
            </p>
          )}
        </Row>
      ))}
    </dl>
  );
}

export default UseLegend;
