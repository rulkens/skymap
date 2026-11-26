/** CatalogStatus — a failed catalog load or build, in the data sidebar's pinned block. */
import type { ReactNode } from 'react';
import styles from './CatalogStatus.module.css';

export type CatalogStatusProps = {
  readonly message: string;
};

function CatalogStatus({ message }: CatalogStatusProps): ReactNode {
  return (
    <p role="status" className={styles.root}>
      {message}
    </p>
  );
}

export default CatalogStatus;
