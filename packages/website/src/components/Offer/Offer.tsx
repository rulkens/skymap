/*
 * Offer — one thing we can deliver, as a ledger row: its `picture` beside its
 * name, a sentence or two (the children), what the code does `today` and what
 * would be work done for the client (`work`), then one `link`, in halves of the
 * page grid. `wide` runs the picture across the row and sets the words in a row
 * under it, in thirds: the name, today, the work. Narrow, the name comes first,
 * then the picture, then the rest.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Offer.module.css';

type OfferProps = {
  title: string;
  wide?: boolean;
  // Slots of the page that places it (`slot="picture"` …); optional only because astro check does not see them as props.
  picture?: ReactNode;
  today?: ReactNode;
  work?: ReactNode;
  link?: ReactNode;
  children: ReactNode;
};

function Offer({ title, wide = false, picture, today, work, link, children }: OfferProps) {
  return (
    <article className={cx(styles.root, wide && styles.wide)}>
      {picture}
      <div>
        <h3>{title}</h3>
        {children}
        <dl className={styles.terms}>
          <dt>Today</dt>
          <dd>{today}</dd>
          <dt>Work for you</dt>
          <dd>{work}</dd>
        </dl>
        {link}
      </div>
    </article>
  );
}

export default Offer;
