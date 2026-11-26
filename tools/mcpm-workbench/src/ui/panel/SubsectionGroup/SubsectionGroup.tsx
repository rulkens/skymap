/** SubsectionGroup — a titled run of rows inside a section, under a divider that spans the sidebar. */
import type { ReactNode } from 'react';
import styles from './SubsectionGroup.module.css';

export type SubsectionGroupProps = {
  readonly title: string;
  readonly children: ReactNode;
};

function SubsectionGroup({ title, children }: SubsectionGroupProps): ReactNode {
  return (
    <div className={styles.root} role="group" aria-label={title}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </div>
  );
}

export default SubsectionGroup;
