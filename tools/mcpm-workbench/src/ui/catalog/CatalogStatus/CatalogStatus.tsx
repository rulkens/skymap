/** CatalogStatus — no points, or a failed load, build or export, in the data sidebar's
 *  pinned block. An alert: a polite region mounted with its text is often not announced. */
import type { ReactNode } from 'react';
import styles from './CatalogStatus.module.css';

export type CatalogStatusProps = {
  readonly message: string;
};

function CatalogStatus({ message }: CatalogStatusProps): ReactNode {
  return (
    <p role="alert" className={styles.root}>
      {message}
    </p>
  );
}

export default CatalogStatus;
