/**
 * EmptyState — shown when the registry fetch failed, or succeeded with no
 * groups (an unbaked checkout: `watchRegistrySaga` treats a 404 and Vite's
 * SPA-fallback 200 the same way, so "ready with zero groups" IS "never
 * baked" — see that saga's own doc). Names the exact recovery steps.
 */
import type { ReactNode } from 'react';

import { useAppSelector } from '../../store/hooks';
import styles from './EmptyState.module.css';

function EmptyState(): ReactNode {
  const status = useAppSelector((state) => state.registry.status);
  const groups = useAppSelector((state) => state.registry.groups);
  const error = useAppSelector((state) => state.registry.error);

  if (status === 'error') {
    return (
      <div className={styles.root}>
        <p className={styles.error}>Failed to load the scene registry: {error}</p>
      </div>
    );
  }

  if (status !== 'ready' || groups.length > 0) return null;

  return (
    <div className={styles.root}>
      <p>No baked scenes yet.</p>
      <p>
        Requires a Datafordeler API key in the keychain as{' '}
        <code className={styles.code}>skymap-datafordeler-apikey</code>.
      </p>
      <p>
        Then run <code className={styles.code}>npm run fetch-dhm</code> followed by{' '}
        <code className={styles.code}>npm run bake-lidar</code>.
      </p>
    </div>
  );
}

export default EmptyState;
