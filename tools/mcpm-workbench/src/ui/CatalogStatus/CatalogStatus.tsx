/**
 * CatalogStatus — `catalog.statusMessage` (a failed catalog load or build) in
 * the data sidebar's pinned block. It reads the store, so it must render
 * inside App's `<Provider>`, not in App itself.
 */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../store/hooks';
import styles from './CatalogStatus.module.css';

function CatalogStatus(): ReactNode {
  const message = useAppSelector((s) => s.catalog.statusMessage);
  if (!message) return null;
  return (
    <p role="status" className={styles.root}>
      {message}
    </p>
  );
}

export default CatalogStatus;
