import type { PersistedValue } from '../../@types/state/PersistedValue';
import type { AppStore } from '../../store/types';

/**
 * One store subscription writing each row's value on change. Snapshots are
 * taken BEFORE subscribing so a store seeded from storage writes nothing at
 * install; write errors (private mode, quota) are swallowed: best-effort.
 */
export function persistValues(
  store: AppStore,
  rows: readonly PersistedValue<unknown>[],
): () => void {
  const last = rows.map((row) => row.select(store.getState()));
  return store.subscribe(() => {
    const state = store.getState();
    rows.forEach((row, i) => {
      const current = row.select(state);
      if (current === last[i] || row.skip?.(current)) return;
      last[i] = current;
      try {
        window.localStorage.setItem(row.key, row.serialize(current));
      } catch {
        // Degraded but acceptable: the value is simply not remembered.
      }
    });
  });
}
