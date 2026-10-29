/*
 * Section — one block of a page: the page's column and the gap above it. `as="div"`
 * is the block that carries no landmark of its own, such as the closing sources.
 */
import type { ReactNode } from 'react';

import styles from './Section.module.css';

type SectionProps = { id?: string; as?: 'section' | 'div'; children: ReactNode };

function Section({ id, as: Tag = 'section', children }: SectionProps) {
  return (
    <Tag className={styles.root} id={id}>
      {children}
    </Tag>
  );
}

export default Section;
