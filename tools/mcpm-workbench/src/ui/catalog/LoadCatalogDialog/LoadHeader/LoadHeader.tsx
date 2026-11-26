/** LoadHeader — the load dialog's title and its note that the file stays on this computer. */
import type { ReactNode } from 'react';
import styles from './LoadHeader.module.css';

export type LoadHeaderProps = {
  readonly titleId: string;
  readonly noteId: string;
};

function LoadHeader({ titleId, noteId }: LoadHeaderProps): ReactNode {
  return (
    <header className={styles.root}>
      <h2 id={titleId} className={styles.title}>
        Load catalog
      </h2>
      <p id={noteId} className={styles.note}>
        Read in this browser. The file is not uploaded.
      </p>
    </header>
  );
}

export default LoadHeader;
