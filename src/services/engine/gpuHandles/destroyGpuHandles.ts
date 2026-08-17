import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { Disposable } from '../../../@types/engine/handles/Disposable';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Walks `rows` in REVERSE array order — a later-constructed handle (e.g.
 * starCatalogPickRenderer) can hold a reference into an earlier one, so it
 * must be torn down first. Non-null fields only; each is nulled after.
 */
export function destroyGpuHandles(rows: readonly GpuHandleRow[], state: EngineState): void {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!; // i stays in [0, rows.length - 1] by the loop guard
    // Same correlated-union gap as constructGpuHandles (see its cast
    // comment); Disposable narrows just enough to call destroy().
    const handle = (state.gpu as Record<GpuHandleKey, Disposable | null>)[row.key];
    if (handle !== null) {
      handle.destroy();
      (state.gpu as Record<GpuHandleKey, unknown>)[row.key] = null;
    }
  }
}
