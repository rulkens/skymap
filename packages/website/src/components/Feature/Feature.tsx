/*
 * Feature — one thing the app does, as a ledger row: its picture with the
 * picture's label, and beside it a small line of context, the name, the words
 * (the children), one question set in the display face, and the control that
 * opens it, on the page grid: the picture in seven columns and the words in
 * five. `wide` gives the picture the full row and sets the name, the words and
 * the question under it in thirds, or with the name above them while the page
 * is narrower than its full column. Narrow, the name comes first, then the
 * picture, then the rest.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './Feature.module.css';

type FeatureProps = {
  shot: string;
  tall: string;
  title: string;
  kicker: string;
  ask: string;
  href: string;
  action: string;
  wide?: boolean;
  children: ReactNode;
};

function Feature({
  shot,
  tall,
  title,
  kicker,
  ask,
  href,
  action,
  wide = false,
  children,
}: FeatureProps) {
  // The picture's box: the text column when wide, seven of its twelve columns otherwise.
  const sizes = wide
    ? '(max-width: 900px) 100vw, min(calc(100vw - 5.5rem), 72rem)'
    : '(max-width: 900px) 100vw, (max-width: 1239px) calc(58.4vw - 4.5rem), 40.75rem';
  return (
    <article className={cx(styles.root, wide && styles.wide)}>
      <header className={styles.head}>
        <p className={styles.kicker}>{kicker}</p>
        <h3>{title}</h3>
      </header>
      <figure className={styles.figure}>
        <Shot id={shot} tall={tall} sizes={sizes} />
        <figcaption>
          <ShotCaption id={shot} open={false} />
        </figcaption>
      </figure>
      <div className={styles.words}>{children}</div>
      <div className={styles.act}>
        <p className={styles.label}>Ask the class</p>
        <p className={styles.ask}>{ask}</p>
        <ViewLink hang href={href}>
          {action}
        </ViewLink>
      </div>
    </article>
  );
}

export default Feature;
