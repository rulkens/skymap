/*
 * Note — a small, dim paragraph beside the argument: when a page was checked,
 * whose account a claim is, what a list leaves out. It closes a block, a
 * little under what it follows; `flow` leaves it among other paragraphs, with
 * their spacing and measure.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Note.module.css';

type NoteProps = { flow?: boolean; children?: ReactNode };

function Note({ flow = false, children }: NoteProps) {
  return <p className={cx(styles.root, !flow && styles.closing)}>{children}</p>;
}

export default Note;
