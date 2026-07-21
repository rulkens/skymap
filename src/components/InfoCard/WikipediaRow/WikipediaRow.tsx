/**
 * WikipediaRow — the "Learn more" link row shared by the body and famous-star
 * detail cards.
 *
 * A single CardRow whose value is an external Wikipedia anchor, styled with the
 * card family's `externalInline` class so it matches the galaxy card's catalogue
 * links.  Takes an article `title` (spaces/underscores/encoding handled by
 * `wikipediaUrl`) rather than a full href, so callers pass the datum they hold —
 * a body's explicit `wikiTitle` or a star's resolved name — not a pre-built URL.
 */

import type { ReactNode } from 'react';
import CardRow from '../CardRow/CardRow';
import { wikipediaUrl } from '../../../utils/format/wikipediaUrl';
import styles from '../cardChrome.module.css';

export type WikipediaRowProps = {
  readonly title: string;
};

function WikipediaRow({ title }: WikipediaRowProps): ReactNode {
  return (
    <CardRow
      label="Learn more"
      value={
        <a
          className={styles.externalInline}
          href={wikipediaUrl(title)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Wikipedia
        </a>
      }
    />
  );
}

export default WikipediaRow;
