import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Walks `rows` in array order, writing each result onto `state.gpu` first,
 * so a later row's `construct` can read an earlier row's value there directly.
 */
export function constructGpuHandles(
  rows: readonly GpuHandleRow[],
  state: EngineState,
  deps: GpuHandleConstructDeps,
): void {
  for (const row of rows) {
    // Correlation lives at the row literal (GpuHandleRow distributes over
    // GpuHandleKey); tsc can't carry it through the loop var's union type.
    (state.gpu as Record<GpuHandleKey, unknown>)[row.key] = row.construct(state, deps);
  }
}
