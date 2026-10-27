/*
 * FeatureSection — one thing Skymap does: its name, one line, a link to the page that explains it and
 * an optional `small` visual in five columns of the page grid, beside one large visual (the children) in
 * the other seven. `side` is where the large visual stands when wide (the words take the other side);
 * it is set per section, not counted across the page, because an island between sections breaks any
 * sibling count. Narrow, they stack, words first. `level` 2 is a section that is a part of the page itself:
 * a part's heading and room above it.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import { sitePath } from '../../utils/sitePath.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './FeatureSection.module.css';

type FeatureSectionProps = {
  title: string;
  line: string;
  href: string;
  label: string;
  level?: 2 | 3;
  side?: 'left' | 'right';
  // A slot of the page that places it (`slot="small"`); optional only because astro check does not see slots as props.
  small?: ReactNode;
  children: ReactNode;
};

function FeatureSection({
  title,
  line,
  href,
  label,
  level = 3,
  side = 'right',
  small,
  children,
}: FeatureSectionProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section className={cx(styles.root, level === 2 && styles.part, side === 'left' && styles.left)}>
      <div className={styles.words}>
        <Heading className={level === 3 ? styles.title : undefined}>{title}</Heading>
        <p>{line}</p>
        <ObjLink size="small" hang href={sitePath(href)}>
          {label}
        </ObjLink>
        {small && <div className={styles.small}>{small}</div>}
      </div>
      <div className={styles.visual}>{children}</div>
    </section>
  );
}

export default FeatureSection;
