/*
 * FeatureRow — the step from Places to the Features page: a heading and a line (the page's words), then
 * the Features page's Places sections in its own order, each its first picture floating frameless over its
 * name and a link to that section, and last one ring link to the whole page.
 */
import type { CSSProperties, ReactNode } from 'react';

import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import { SUBJECT_SIZES, SUBJECT_ZOOM } from './FeatureRow.constants.ts';
import styles from './FeatureRow.module.css';

type FeatureRowProps = {
  title: string;
  /** Each section as named on the Features page, its picture there and its address. */
  subjects: readonly { name: string; shot: string; href: string }[];
  /** The ring link's words and the Features page's address. */
  label: string;
  href: string;
  children: ReactNode;
};

function FeatureRow({ title, subjects, label, href, children }: FeatureRowProps) {
  return (
    <section className={styles.root}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.words}>{children}</div>
      <ul className={styles.row}>
        {subjects.map(({ name, shot, href: at }) => (
          <li key={shot}>
            <a className={styles.subject} href={at}>
              <span
                className={cx(styles.picture, !siteShot(shot).settings?.matte && styles.soft)}
                style={{ '--zoom': SUBJECT_ZOOM[shot] } as CSSProperties}
              >
                <Shot id={shot} sizes={SUBJECT_SIZES} alt="" />
              </span>
              <span className={styles.name}>{name}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className={styles.all}>
        <ObjLink href={href}>{label}</ObjLink>
      </div>
    </section>
  );
}

export default FeatureRow;
