/*
 * Group — a named part of a section: its heading, then what belongs under it
 * (the children), usually a Claims list. `big` sets the name at the big ring's
 * size, for a part that is a subject of its own. A sentence passed as `lede`
 * stands beside the name, over the list's statements: the name has Claims'
 * three columns of the page grid. `first` is the part that follows the
 * section's own head, which has left its gap.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Group.module.css';

type GroupProps = {
  title: string;
  big?: boolean;
  first?: boolean;
  lede?: ReactNode;
  children: ReactNode;
};

function Group({ title, big = false, first = false, lede, children }: GroupProps) {
  return (
    <div className={cx(styles.root, big && styles.big, first && styles.first)}>
      <div className={cx(styles.name, Boolean(lede) && styles.lede)}>
        <h3>{title}</h3>
        {lede}
      </div>
      {children}
    </div>
  );
}

export default Group;
