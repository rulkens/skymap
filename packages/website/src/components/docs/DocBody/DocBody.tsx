/*
 * DocBody — the running text of a docs page: what the pages' Markdown emits,
 * set for reading at length on black. Jost 400 at 18px, about 65 characters
 * to the line; headings in the display face, never under 20px; a list's
 * bullets are the site's ring, small. The rules reach into the children
 * because compiled Markdown carries no component scope, and they stop at
 * `data-embed`: a component set into the text (a figure, a table, an example)
 * marks its root with it and keeps its own look. The stop adds no weight (`:where`).
 */
import type { ReactNode } from 'react';

import styles from './DocBody.module.css';

type DocBodyProps = { children?: ReactNode };

function DocBody({ children }: DocBodyProps) {
  return <div className={styles.root}>{children}</div>;
}

export default DocBody;
